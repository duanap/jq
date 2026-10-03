export type Side = 'red' | 'black';
export type PieceType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P'; // 帅 士 象 马 车 炮 兵

/** 服务端完整棋子:始终携带真实身份 */
export interface Cell {
  side: Side;
  trueType: PieceType;
  revealed: boolean;
}
export type Board = (Cell | null)[]; // 90 格,索引 = row*9+col,黑上红下

/**
 * 客户端视角棋子 —— 协议红线:
 * 暗子只允许 { side, revealed:false },绝不携带身份字段。
 */
export type PublicCell =
  | { side: Side; revealed: true; type: PieceType }
  | { side: Side; revealed: false }
  | null;

export interface PlyRecord {
  by: Side;
  from: number;
  to: number;
  capture: boolean;
  reveal?: PieceType;
  check: boolean;
}

export type GameOverReason =
  | 'mate'
  | 'stalemate'
  | 'repetition'
  | 'perpetual'
  | 'no_capture'
  | 'timeout'
  | 'resign'
  | 'agreement';

export interface GameResult {
  reason: GameOverReason;
  winner: Side | null;
}
