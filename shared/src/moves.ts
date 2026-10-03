import { colOf, crossedRiver, idx, inPalace, onBoard, ownHalf, posTypeOf, rowOf } from './board';
import type { Board, PieceType } from './types';

export const ORTHO: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export const DIAG1: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const DIAG2: [number, number][] = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
// [dr, dc, 腿dr, 腿dc]
export const KNIGHT: [number, number, number, number][] = [
  [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
  [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
];

/** 一枚棋子在该格的实际身份:明子用真实身份,暗子用位置身份 */
export function effectiveType(board: Board, from: number): PieceType {
  const p = board[from]!;
  return p.revealed ? p.trueType : posTypeOf(from);
}

/** 伪合法走法(不含自将过滤)。明士全盘斜走、明象可过河;暗士暗象仍受限。 */
export function pseudoMoves(board: Board, from: number): number[] {
  const p = board[from]!;
  const type = p.revealed ? p.trueType : posTypeOf(from);
  const dark = !p.revealed;
  const side = p.side;
  const r0 = rowOf(from);
  const c0 = colOf(from);
  const out: number[] = [];
  const tryDest = (r: number, c: number) => {
    if (!onBoard(r, c)) return;
    const t = board[idx(r, c)];
    if (!t || t.side !== side) out.push(idx(r, c));
  };

  if (type === 'R') {
    for (const [dr, dc] of ORTHO) {
      let r = r0 + dr, c = c0 + dc;
      while (onBoard(r, c)) {
        const t = board[idx(r, c)];
        if (!t) {
          out.push(idx(r, c));
        } else {
          if (t.side !== side) out.push(idx(r, c));
          break;
        }
        r += dr; c += dc;
      }
    }
  } else if (type === 'C') {
    for (const [dr, dc] of ORTHO) {
      let r = r0 + dr, c = c0 + dc;
      let screen = false;
      while (onBoard(r, c)) {
        const t = board[idx(r, c)];
        if (!screen) {
          if (!t) out.push(idx(r, c));
          else screen = true;
        } else if (t) {
          if (t.side !== side) out.push(idx(r, c));
          break;
        }
        r += dr; c += dc;
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc, lr, lc] of KNIGHT) {
      const r = r0 + dr, c = c0 + dc;
      if (!onBoard(r, c)) continue;
      if (board[idx(r0 + lr, c0 + lc)]) continue; // 蹩马腿
      tryDest(r, c);
    }
  } else if (type === 'B') {
    for (const [dr, dc] of DIAG2) {
      const r = r0 + dr, c = c0 + dc;
      if (!onBoard(r, c)) continue;
      if (board[idx(r0 + dr / 2, c0 + dc / 2)]) continue; // 塞象眼
      if (dark && !ownHalf(idx(r, c), side)) continue; // 暗象不过河,明象自由
      tryDest(r, c);
    }
  } else if (type === 'A') {
    for (const [dr, dc] of DIAG1) {
      const r = r0 + dr, c = c0 + dc;
      if (!onBoard(r, c)) continue;
      if (dark && !inPalace(idx(r, c), side)) continue; // 暗士不出宫,明士自由
      tryDest(r, c);
    }
  } else if (type === 'K') {
    for (const [dr, dc] of ORTHO) {
      const r = r0 + dr, c = c0 + dc;
      if (!onBoard(r, c) || !inPalace(idx(r, c), side)) continue;
      tryDest(r, c);
    }
  } else if (type === 'P') {
    const dr = side === 'red' ? -1 : 1;
    tryDest(r0 + dr, c0);
    if (crossedRiver(from, side)) {
      tryDest(r0, c0 - 1);
      tryDest(r0, c0 + 1);
    }
  }
  return out;
}
