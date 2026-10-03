import { colOf, crossedRiver, idx, inPalace, onBoard, other, ownHalf, posTypeOf, rowOf } from './board';
import type { Board, Side } from './types';
import { DIAG1, KNIGHT, ORTHO } from './moves';

export function findKing(board: Board, side: Side): number {
  const rows = side === 'red' ? [7, 8, 9] : [0, 1, 2];
  for (const r of rows) {
    for (let c = 3; c <= 5; c++) {
      const p = board[idx(r, c)];
      if (p && p.side === side && p.revealed && p.trueType === 'K') return idx(r, c);
    }
  }
  return -1;
}

/** 该格棋子的攻击范围(吃子意义上的攻击;炮隔一子打,空格不算) */
export function attacksFrom(board: Board, from: number): number[] {
  const p = board[from]!;
  const type = p.revealed ? p.trueType : posTypeOf(from);
  const dark = !p.revealed;
  const side = p.side;
  const r0 = rowOf(from);
  const c0 = colOf(from);
  const out: number[] = [];
  const add = (r: number, c: number) => {
    if (onBoard(r, c)) out.push(idx(r, c));
  };

  if (type === 'R') {
    for (const [dr, dc] of ORTHO) {
      let r = r0 + dr, c = c0 + dc;
      while (onBoard(r, c)) {
        out.push(idx(r, c));
        if (board[idx(r, c)]) break;
        r += dr; c += dc;
      }
    }
  } else if (type === 'C') {
    for (const [dr, dc] of ORTHO) {
      let r = r0 + dr, c = c0 + dc;
      let screen = false;
      while (onBoard(r, c)) {
        if (!screen) {
          if (board[idx(r, c)]) screen = true;
        } else if (board[idx(r, c)]) {
          out.push(idx(r, c));
          break;
        }
        r += dr; c += dc;
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc, lr, lc] of KNIGHT) {
      const r = r0 + dr, c = c0 + dc;
      if (!onBoard(r, c)) continue;
      if (board[idx(r0 + lr, c0 + lc)]) continue;
      add(r, c);
    }
  } else if (type === 'B') {
    for (const [dr, dc] of DIAG1.map(([a, b]) => [a * 2, b * 2] as [number, number])) {
      const r = r0 + dr, c = c0 + dc;
      if (!onBoard(r, c)) continue;
      if (board[idx(r0 + dr / 2, c0 + dc / 2)]) continue;
      if (dark && !ownHalf(idx(r, c), side)) continue;
      add(r, c);
    }
  } else if (type === 'A') {
    for (const [dr, dc] of DIAG1) {
      const r = r0 + dr, c = c0 + dc;
      if (!onBoard(r, c)) continue;
      if (dark && !inPalace(idx(r, c), side)) continue;
      add(r, c);
    }
  } else if (type === 'K') {
    for (const [dr, dc] of ORTHO) {
      const r = r0 + dr, c = c0 + dc;
      if (!onBoard(r, c) || !inPalace(idx(r, c), side)) continue;
      add(r, c);
    }
  } else if (type === 'P') {
    const dr = side === 'red' ? -1 : 1;
    add(r0 + dr, c0);
    if (crossedRiver(from, side)) {
      add(r0, c0 - 1);
      add(r0, c0 + 1);
    }
  }
  return out;
}

/** 两帅是否照面(中间无子) */
export function kingsFacing(board: Board): boolean {
  const kr = findKing(board, 'red');
  const kb = findKing(board, 'black');
  if (kr < 0 || kb < 0) return false;
  if (colOf(kr) !== colOf(kb)) return false;
  for (let r = rowOf(kb) + 1; r < rowOf(kr); r++) {
    if (board[idx(r, colOf(kr))]) return false;
  }
  return true;
}

export function inCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side);
  if (k < 0) return false;
  const by = other(side);
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (p && p.side === by && attacksFrom(board, i).includes(k)) return true;
  }
  return false;
}
