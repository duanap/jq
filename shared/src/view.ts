import type { Board, GameMode, PublicCell } from './types';

/** 服务端棋盘 → 公开视角。乱阵暗子不发送阵营和身份。 */
export function publicView(board: Board, mode: GameMode = 'classic'): PublicCell[] {
  return board.map((p) => {
    if (!p) return null;
    if (p.revealed) return { side: p.side, revealed: true, type: p.trueType };
    return mode === 'shuffle' ? { revealed: false } : { side: p.side, revealed: false };
  });
}

/** 公开视角 → 引擎棋盘。乱阵走法忽略暗子的阵营和兵种占位值。 */
export function boardFromView(cells: PublicCell[]): Board {
  return cells.map((c) =>
    c ? (c.revealed ? { side: c.side, trueType: c.type, revealed: true } : { side: c.side ?? 'red', trueType: 'K', revealed: false }) : null,
  );
}
