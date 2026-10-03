import type { Board, PublicCell } from './types';

/** 服务端棋盘 → 公开视角(暗子只有 side,没有身份) */
export function publicView(board: Board): PublicCell[] {
  return board.map((p) =>
    p ? (p.revealed ? { side: p.side, revealed: true, type: p.trueType } : { side: p.side, revealed: false }) : null,
  );
}

/** 公开视角 → 引擎棋盘(暗子 trueType 用占位符,引擎保证暗子永不读 trueType) */
export function boardFromView(cells: PublicCell[]): Board {
  return cells.map((c) =>
    c ? (c.revealed ? { side: c.side, trueType: c.type, revealed: true } : { side: c.side, trueType: 'K' as const, revealed: false }) : null,
  );
}
