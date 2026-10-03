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
  /** 双方吃子清单:red = 红方吃到的(黑子),black = 黑方吃到的(红子) */
  captured: { red: PieceType[]; black: PieceType[] };
  /** 房主(唯一可解散)所在一方 */
  owner: Side;
  /** 待处理的悔棋请求方 */
  pendingUndo?: Side;
  drawOffer?: Side;
  rematch: { red: boolean; black: boolean };
  result?: GameResult;
  /** 房间自动解散时间(epoch ms);对局进行中为空 */
  closeAt?: number;
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
