import type { GameResult, PieceType, PublicCell, Side } from './types';

export interface TimeOpts {
  /** 每方基础时长(分钟),<=0 表示不限时 */
  baseMin: number;
  /** 每步加秒 */
  incSec: number;
}
export interface SeatInfo {
  nick: string;
  online: boolean;
}
export interface Clocks {
  red: number;
  black: number;
}

export interface GameState {
  phase: 'waiting' | 'playing' | 'over';
  seats: { red: SeatInfo | null; black: SeatInfo | null };
  cells: PublicCell[];
  turn: Side;
  moveNum: number;
  lastMove?: { from: number; to: number };
  check: boolean;
  reveal?: { pos: number; type: PieceType };
  capture?: boolean;
  clocks: Clocks | null;
  /**
   * 吃子清单(按接收者视角生成):
   * mine = 我吃到的(可见真实身份);theirs = 对方吃到的我的子,
   * 其中对方吃掉的暗子对我是保密的(type 为 null,前端显示遮罩背面)。
   */
  captured: { mine: { type: PieceType | null }[]; theirs: { type: PieceType | null }[] };
  /** 房主(唯一可解散)所在一方 */
  owner: Side;
  /** 待处理的悔棋请求方 */
  pendingUndo?: Side;
  drawOffer?: Side;
  rematch: { red: boolean; black: boolean };
  result?: GameResult;
}

export type ClientMsg =
  | { t: 'create'; nick: string; opts?: TimeOpts }
  | { t: 'join'; room: string; nick?: string; token?: string }
  | { t: 'move'; from: number; to: number }
  | { t: 'resign' }
  | { t: 'draw_offer' }
  | { t: 'draw_accept' }
  | { t: 'draw_decline' }
  | { t: 'undo_request' }
  | { t: 'undo_accept' }
  | { t: 'undo_decline' }
  | { t: 'leave' }
  | { t: 'dissolve' }
  | { t: 'rematch' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'joined'; room: string; token: string; you: Side; state: GameState }
  | { t: 'state'; seq: number; you: Side | null; state: GameState }
  | { t: 'closed'; reason: string }
  | { t: 'error'; code: string; msg?: string }
  | { t: 'pong' };
