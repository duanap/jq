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

/** 保持常规开局位置，把双方的暗子混在同一个池里洗。 */
export function shuffleMixedBoard(): Board {
  const board = initialBoard();
  const squares = board.flatMap((piece, index) => piece && piece.trueType !== 'K' ? [index] : []);
  const pieces = squares.map((square) => ({ ...board[square]!, revealed: false }));
  shuffleInPlace(pieces);
  squares.forEach((square, index) => { board[square] = pieces[index]!; });
  return board;
}
