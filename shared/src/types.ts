export type Side = 'red' | 'black';
export type GameMode = 'classic' | 'shuffle';
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
 * 经典暗子公开阵营，乱阵暗子只公开明暗状态。
 */
export type PublicCell =
  | { side: Side; revealed: true; type: PieceType }
  | { side?: Side; revealed: false }
  | null;

export interface PlyRecord {
  by: Side;
  from: number;
  to: number;
  capture: boolean;
  /** 被吃子的真实身份，客户端可见性由房间根据玩法决定。 */
  capturedType?: PieceType;
  capturedSide?: Side;
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
