import type { Board, PieceType, Side } from './types';

export const ROWS = 10;
export const COLS = 9;
export const idx = (r: number, c: number) => r * COLS + c;
export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;
export const onBoard = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export const other = (s: Side): Side => (s === 'red' ? 'black' : 'red');

// 标准开局一行:车马象士(帅)士象马车
const BACK: PieceType[] = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'];

/** 标准象棋初始局面(全部明置,供洗子与位置表使用) */
export function initialBoard(): Board {
  const b: Board = new Array(ROWS * COLS).fill(null);
  const put = (r: number, c: number, side: Side, t: PieceType) => {
    b[idx(r, c)] = { side, trueType: t, revealed: true };
  };
  for (let c = 0; c < COLS; c++) {
    put(0, c, 'black', BACK[c]);
    put(9, c, 'red', BACK[c]);
  }
  for (const c of [1, 7]) {
    put(2, c, 'black', 'C');
    put(7, c, 'red', 'C');
  }
  for (const c of [0, 2, 4, 6, 8]) {
    put(3, c, 'black', 'P');
    put(6, c, 'red', 'P');
  }
  return b;
}

/**
 * 位置身份:初始布局下该格对应的兵种。
 * 暗子未动过必在初始位,所以暗子的走法身份永远查这张表。
 */
export function posTypeOf(i: number): PieceType {
  const r = rowOf(i);
  const c = colOf(i);
  if (r === 0 || r === 9) return BACK[c];
  if ((r === 2 || r === 7) && (c === 1 || c === 7)) return 'C';
  if ((r === 3 || r === 6) && c % 2 === 0) return 'P';
  throw new Error(`pos ${i} 没有位置身份`);
}

export const inPalace = (i: number, s: Side) =>
  colOf(i) >= 3 && colOf(i) <= 5 && (s === 'red' ? rowOf(i) >= 7 : rowOf(i) <= 2);
export const ownHalf = (i: number, s: Side) => (s === 'red' ? rowOf(i) >= 5 : rowOf(i) <= 4);
export const crossedRiver = (i: number, s: Side) => !ownHalf(i, s);
