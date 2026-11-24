import { other, playingSide } from './board';
import { pseudoMoves } from './moves';
import { inCheck, kingsFacing } from './check';
import { shuffleBoard, shuffleMixedBoard } from './shuffle';
import type { Board, Cell, GameMode, GameResult, PieceType, PlyRecord, Side } from './types';

export interface AppliedMove {
  by: Side;
  from: number;
  to: number;
  capture: boolean;
  /** 被吃子的真实身份，客户端可见性由房间根据玩法决定。 */
  capturedType?: PieceType;
  capturedSide?: Side;
  /** 被吃子被吃时是否为暗面 */
  capturedWasDark?: boolean;
  reveal?: PieceType;
  check: boolean;
  result?: GameResult;
}

export function canControl(piece: Cell, from: number, side: Side, mode: GameMode = 'classic'): boolean {
  return playingSide(piece, from, mode) === side;
}

/** 合法走法按行动前已公开的身份判定，暗子翻开结果不能作为试探走法的依据。 */
export function legalTargets(board: Board, side: Side, from: number, mode: GameMode = 'classic'): number[] {
  const p = board[from];
  if (!p || !canControl(p, from, side, mode)) return [];
  const out: number[] = [];
  for (const to of pseudoMoves(board, from, mode)) {
    const dst = board[to];
    if (dst?.revealed && dst.trueType === 'K') continue;
    board[to] = p;
    board[from] = null;
    // 暗子临时放到落点后只作为挡子，不能根据落点或未揭开的身份试探将军。
    const bad = inCheck(board, side, mode, to) || kingsFacing(board);
    board[from] = p;
    board[to] = dst ?? null;
    if (!bad) out.push(to);
  }
  return out;
}

export function hasAnyLegalMove(board: Board, side: Side, mode: GameMode = 'classic'): boolean {
  for (let i = 0; i < 90; i++) {
    if (legalTargets(board, side, i, mode).length > 0) return true;
  }
  return false;
}

/** 局面指纹(含行棋方):暗子只按"暗"参与,不泄露身份 */
export function posKey(board: Board, turn: Side): string {
  let s = (turn === 'red' ? 'r' : 'b') + '|';
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p) {
      s += '.';
      continue;
    }
    if (!p.revealed) {
      s += p.side === 'red' ? 'x' : 'X';
      continue;
    }
    s += (p.side === 'red' ? 'r' : 'b') + p.trueType;
  }
  return s;
}

/** 无吃子判和阈值:60 回合 = 120 半步 */
export const NO_CAPTURE_LIMIT = 120;

export class JieqiGame {
  board: Board;
  turn: Side = 'red';
  ply = 0;
  status: 'playing' | 'over' = 'playing';
  result?: GameResult;
  noCapturePlies = 0;
  history: (PlyRecord & { key: string })[] = [];
  private counts = new Map<string, number>();

  constructor(board?: Board, readonly mode: GameMode = 'classic') {
    this.board = board ?? (mode === 'shuffle' ? shuffleMixedBoard() : shuffleBoard());
    this.bump(posKey(this.board, this.turn));
  }

  private bump(key: string) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  legalTargets(from: number): number[] {
    return legalTargets(this.board, this.turn, from, this.mode);
  }

  applyMove(from: number, to: number): AppliedMove | null {
    if (this.status !== 'playing') return null;
    const p = this.board[from];
    if (!p || !this.legalTargets(from).includes(to)) return null;
    const by = this.turn;

    const reveal = p.revealed ? undefined : p.trueType;
    const dst = this.board[to];
    const capture = !!dst;
    const capturedType = dst?.trueType;
    const capturedSide = dst?.side;
    const capturedWasDark = dst ? !dst.revealed : undefined;
    const prevNoCapture = this.noCapturePlies;
    this.board[to] = p;
    this.board[from] = null;
    if (reveal !== undefined) p.revealed = true; // 动子即揭

    this.ply += 1;
    this.noCapturePlies = capture ? 0 : this.noCapturePlies + 1;
    this.turn = other(this.turn);

    const check = inCheck(this.board, this.turn, this.mode);
    const key = posKey(this.board, this.turn);
    this.bump(key);
    const rec = { by, from, to, capture, capturedType, capturedSide, capturedWasDark, reveal, check, prevNoCapture, key };
    this.history.push(rec);

    let result: GameResult | undefined;
    if (!hasAnyLegalMove(this.board, this.turn, this.mode)) {
      result = { reason: check ? 'mate' : 'stalemate', winner: by };
    } else if (this.noCapturePlies >= NO_CAPTURE_LIMIT) {
      result = { reason: 'no_capture', winner: null };
    } else if ((this.counts.get(key) ?? 0) >= 3) {
      result = judgeRepetition(this.history);
    }
    if (result) {
      this.status = 'over';
      this.result = result;
    }
    return { by, from, to, capture, capturedType, capturedSide, capturedWasDark, reveal, check, result };
  }

  /**
   * 悔棋:撤销最后一着(仅对局中)。
   * 经典模式的已翻棋子保持明面，被吃子按原明暗恢复。乱阵公开暗子身份的一着不能撤销。
   */
  undoLast(): boolean {
    if (!this.canUndoLast()) return false;
    const last = this.history.pop();
    if (!last) return false;
    const mover = this.board[last.to]!;
    this.board[last.from] = mover;
    this.board[last.to] = null;
    if (last.capturedType) {
      this.board[last.to] = {
        side: last.capturedSide ?? other(last.by),
        trueType: last.capturedType,
        revealed: !last.capturedWasDark,
      };
    }
    this.turn = last.by;
    this.ply -= 1;
    this.noCapturePlies = last.prevNoCapture;
    const c = this.counts.get(last.key) ?? 0;
    if (c <= 1) this.counts.delete(last.key);
    else this.counts.set(last.key, c - 1);
    return true;
  }

  canUndoLast(): boolean {
    const last = this.history[this.history.length - 1];
    return this.status === 'playing' && !!last && (this.mode === 'classic' || (!last.reveal && !last.capturedWasDark));
  }
}

/** 三次重复局面:窗口内恰有一方每步都在将军 → 长将判负;否则判和 */
function judgeRepetition(history: (PlyRecord & { key: string })[]): GameResult {
  const key = history[history.length - 1]!.key;
  let first = history.length - 1;
  for (let i = 0; i < history.length; i++) {
    if (history[i]!.key === key) {
      first = i;
      break;
    }
  }
  const reds: boolean[] = [];
  const blacks: boolean[] = [];
  for (let i = first; i < history.length; i++) {
    (history[i]!.by === 'red' ? reds : blacks).push(history[i]!.check);
  }
  const all = (a: boolean[]) => a.length > 0 && a.every(Boolean);
  if (all(reds) !== all(blacks)) {
    return { reason: 'perpetual', winner: all(reds) ? 'black' : 'red' };
  }
  return { reason: 'repetition', winner: null };
}
