import { initialBoard } from './board';
import { shuffleInPlace } from './random';
import type { Board, PieceType, Side } from './types';

/** 揭棋开局:帅/将明置原位,各方其余 15 子洗入本方其余 15 位,全部暗置 */
export function shuffleBoard(): Board {
  const b = initialBoard();
  for (const side of ['red', 'black'] as Side[]) {
    const squares: number[] = [];
    const types: string[] = [];
    for (let i = 0; i < 90; i++) {
      const p = b[i]!;
      if (p && p.side === side && p.trueType !== 'K') {
        squares.push(i);
        types.push(p.trueType);
      }
    }
    shuffleInPlace(types);
    squares.forEach((sq, k) => {
      b[sq] = { side, trueType: types[k] as PieceType, revealed: false };
    });
  }
  return b;
}
