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
  /** 被吃子的身份(仅吃子方知道;被吃方若原本未见,只知少了子) */
  capturedType?: PieceType;
  /** 被吃子被吃时是否已是明子(悔棋恢复用:暗子恢复为背面) */
  capturedWasDark?: boolean;
  reveal?: PieceType;
  check: boolean;
  /** 该步走之前的无吃子计数(悔棋回滚用) */
  prevNoCapture: number;
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
