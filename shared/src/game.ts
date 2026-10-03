import { other, posTypeOf } from './board';
import { pseudoMoves } from './moves';
import { inCheck, kingsFacing } from './check';
import { shuffleBoard } from './shuffle';
import type { Board, GameResult, PieceType, PlyRecord, Side } from './types';

export interface AppliedMove {
  by: Side;
  from: number;
  to: number;
  capture: boolean;
  /** 被吃子的身份(吃暗子 = 当场翻开,双方可见) */
  capturedType?: PieceType;
  reveal?: PieceType;
  check: boolean;
  result?: GameResult;
}

/** 合法走法 = 伪合法 − 走后被将/帅将照面;不允许吃将(将死即终局) */
export function legalTargets(board: Board, side: Side, from: number): number[] {
  const p = board[from];
  if (!p || p.side !== side) return [];
  const out: number[] = [];
  for (const to of pseudoMoves(board, from)) {
    const dst = board[to];
    if (dst && dst.side !== side && (dst.revealed ? dst.trueType : posTypeOf(to)) === 'K') continue;
    board[to] = p;
    board[from] = null;
    const bad = inCheck(board, side) || kingsFacing(board);
    board[from] = p;
    board[to] = dst ?? null;
    if (!bad) out.push(to);
  }
  return out;
}

export function hasAnyLegalMove(board: Board, side: Side): boolean {
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (p && p.side === side && legalTargets(board, side, i).length > 0) return true;
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

  constructor(board?: Board) {
    this.board = board ?? shuffleBoard();
    this.bump(posKey(this.board, this.turn));
  }

  private bump(key: string) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  legalTargets(from: number): number[] {
    return legalTargets(this.board, this.turn, from);
  }

  applyMove(from: number, to: number): AppliedMove | null {
    if (this.status !== 'playing') return null;
    const p = this.board[from];
    if (!p || p.side !== this.turn) return null;
    if (!legalTargets(this.board, this.turn, from).includes(to)) return null;

    const reveal = p.revealed ? undefined : p.trueType;
    const dst = this.board[to];
    const capture = !!dst;
    const capturedType = dst?.trueType;
    this.board[to] = p;
    this.board[from] = null;
    if (reveal !== undefined) p.revealed = true; // 动子即揭

    this.ply += 1;
    this.noCapturePlies = capture ? 0 : this.noCapturePlies + 1;
    this.turn = other(this.turn);

    const check = inCheck(this.board, this.turn);
    const key = posKey(this.board, this.turn);
    this.bump(key);
    const rec = { by: p.side, from, to, capture, reveal, check, key };
    this.history.push(rec);

    let result: GameResult | undefined;
    if (!hasAnyLegalMove(this.board, this.turn)) {
      result = { reason: check ? 'mate' : 'stalemate', winner: p.side };
    } else if (this.noCapturePlies >= NO_CAPTURE_LIMIT) {
      result = { reason: 'no_capture', winner: null };
    } else if ((this.counts.get(key) ?? 0) >= 3) {
      result = judgeRepetition(this.history);
    }
    if (result) {
      this.status = 'over';
      this.result = result;
    }
    return { by: rec.by, from, to, capture, capturedType, reveal, check, result };
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
