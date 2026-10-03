import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import { JieqiGame, inCheck, other, publicView } from '@jieqi/shared';
import type { GameResult, GameState, PieceType, Side, TimeOpts } from '@jieqi/shared';
import { ABANDON_MS, OVER_TTL_MS, STALE_MS, WAITING_TTL_MS } from './config';
import { appendRecord } from './store';
import { sendWS } from './send';

export interface Seat {
  side: Side;
  nick: string;
  token: string;
  conn: WebSocket | null;
  lastSeen: number;
}

interface ClockState {
  ms: number;
  turnStart: number;
}

export class Room {
  readonly code: string;
  opts: Required<TimeOpts>;
  game = new JieqiGame();
  seats: { red?: Seat; black?: Seat } = {};
  private seq = 0;
  drawOffer?: Side;
  rematch: { red: boolean; black: boolean } = { red: false, black: false };
  lastEvent?: { from: number; to: number; capture: boolean; reveal?: { pos: number; type: PieceType } };
  /** 双方吃子清单:red = 红方吃到的(黑子),black = 黑方吃到的(红子) */
  captured: { red: PieceType[]; black: PieceType[] } = { red: [], black: [] };
  private clock: { red: ClockState; black: ClockState } | null;
  /** 房间自动解散时间(epoch ms);0 = 对局进行中不限 */
  private closeAt: number;
  startedAt = Date.now();
  lastActivity = Date.now();
  private recorded = false;

  constructor(code: string, opts: TimeOpts) {
    this.code = code;
    this.opts = { baseMin: opts.baseMin ?? 10, incSec: opts.incSec ?? 3 };
    this.clock = this.opts.baseMin > 0 ? { red: { ms: 0, turnStart: 0 }, black: { ms: 0, turnStart: 0 } } : null;
    this.closeAt = Date.now() + WAITING_TTL_MS; // 建房后限时等对手
  }

  phaseOf(): 'waiting' | 'playing' | 'over' {
    if (this.game.status === 'over') return 'over';
    return this.seats.red && this.seats.black ? 'playing' : 'waiting';
  }

  touch() {
    this.lastActivity = Date.now();
  }

  newSeat(side: Side, nick: string): Seat {
    return { side, nick, token: randomBytes(16).toString('hex'), conn: null, lastSeen: Date.now() };
  }

  /** 对局正式开始(第二个玩家入座)时启动时钟,并解除解散倒计时 */
  startClocks() {
    this.closeAt = 0;
    if (!this.clock) return;
    const now = Date.now();
    const base = this.opts.baseMin * 60_000;
    this.clock.red = { ms: base, turnStart: now };
    this.clock.black = { ms: base, turnStart: now };
  }

  private remaining(side: Side): number {
    const c = this.clock![side]!;
    if (this.phaseOf() === 'playing' && this.game.turn === side) {
      return Math.max(0, c.ms - (Date.now() - c.turnStart));
    }
    return c.ms;
  }

  snapshot(): GameState {
    const g = this.game;
    const info = (s?: Seat) => (s ? { nick: s.nick, online: !!s.conn } : null);
    return {
      phase: this.phaseOf(),
      seats: { red: info(this.seats.red), black: info(this.seats.black) },
      cells: publicView(g.board),
      turn: g.turn,
      moveNum: g.ply,
      lastMove: this.lastEvent ? { from: this.lastEvent.from, to: this.lastEvent.to } : undefined,
      check: g.status === 'playing' ? inCheck(g.board, g.turn) : false,
      reveal: this.lastEvent?.reveal,
      capture: this.lastEvent?.capture,
      clocks: this.clock ? { red: this.remaining('red'), black: this.remaining('black') } : null,
      captured: { red: [...this.captured.red], black: [...this.captured.black] },
      drawOffer: this.drawOffer,
      rematch: { ...this.rematch },
      result: g.result,
      closeAt: this.closeAt || undefined,
    };
  }

  broadcast() {
    for (const s of [this.seats.red, this.seats.black]) {
      if (!s?.conn) continue;
      sendWS(s.conn, { t: 'state', seq: ++this.seq, you: s.side, state: this.snapshot() });
    }
  }

  joinedMsg(seat: Seat) {
    return { t: 'joined' as const, room: this.code, token: seat.token, you: seat.side, state: this.snapshot() };
  }

  /** 绑定连接;同座位的旧连接直接顶掉 */
  attach(seat: Seat, conn: WebSocket) {
    if (seat.conn && seat.conn !== conn) {
      (seat.conn as { _ctx?: unknown })._ctx = undefined;
      try { seat.conn.close(); } catch { /* ignore */ }
    }
    seat.conn = conn;
    seat.lastSeen = Date.now();
    (conn as { _ctx?: unknown })._ctx = { room: this, side: seat.side };
  }

  detach(side: Side, conn: WebSocket) {
    const seat = this.seats[side];
    if (!seat || seat.conn !== conn) return;
    seat.conn = null;
    seat.lastSeen = Date.now();
    this.broadcast();
  }

  onMove(side: Side, from: number, to: number): string | null {
    if (this.phaseOf() !== 'playing') return 'not_playing';
    if (side !== this.game.turn) return 'not_your_turn';
    const now = Date.now();
    if (this.clock) {
      const c = this.clock[side]!;
      c.ms = Math.max(0, c.ms - (now - c.turnStart));
      c.turnStart = now;
      if (c.ms <= 0) {
        this.finish({ reason: 'timeout', winner: other(side) });
        return null;
      }
    }
    const mv = this.game.applyMove(from, to);
    if (!mv) return 'illegal_move';
    if (this.clock) {
      this.clock[side]!.ms += this.opts.incSec * 1000;
      this.clock[this.game.turn]!.turnStart = now;
    }
    this.drawOffer = undefined;
    this.lastEvent = {
      from,
      to,
      capture: mv.capture,
      reveal: mv.reveal ? { pos: to, type: mv.reveal } : undefined,
    };
    if (mv.capturedType) this.captured[side]!.push(mv.capturedType);
    this.touch();
    if (this.game.status === 'over') this.finish(this.game.result!);
    else this.broadcast();
    return null;
  }

  resign(side: Side): string | null {
    if (this.phaseOf() !== 'playing') return 'not_playing';
    this.finish({ reason: 'resign', winner: other(side) });
    return null;
  }

  offerDraw(side: Side): string | null {
    if (this.phaseOf() !== 'playing') return 'not_playing';
    if (this.drawOffer) return 'draw_pending';
    this.drawOffer = side;
    this.broadcast();
    return null;
  }

  acceptDraw(side: Side): string | null {
    if (this.drawOffer === undefined || this.drawOffer === side) return 'no_draw_offer';
    this.finish({ reason: 'agreement', winner: null });
    return null;
  }

  declineDraw(side: Side): string | null {
    if (this.drawOffer === undefined || this.drawOffer === side) return 'no_draw_offer';
    this.drawOffer = undefined;
    this.broadcast();
    return null;
  }

  rematchVote(side: Side): string | null {
    if (this.phaseOf() !== 'over') return 'not_over';
    this.rematch[side] = true;
    this.touch();
    if (this.rematch.red && this.rematch.black) this.newGame();
    else this.broadcast();
    return null;
  }

  /** 重开:换先 + 重新洗子 */
  private newGame() {
    const red = this.seats.red!;
    const black = this.seats.black!;
    this.seats = { red: black, black: red };
    black.side = 'red';
    red.side = 'black';
    this.game = new JieqiGame();
    this.rematch = { red: false, black: false };
    this.drawOffer = undefined;
    this.lastEvent = undefined;
    this.captured = { red: [], black: [] };
    this.startedAt = Date.now();
    this.recorded = false;
    this.closeAt = 0;
    this.startClocks();
    this.broadcast();
  }

  /** 是否到期/僵死(供清扫) */
  expired(now: number): boolean {
    return this.closeAt > 0 && now >= this.closeAt;
  }

  stale(now: number): boolean {
    return this.phaseOf() === 'playing' && now - this.lastActivity > STALE_MS;
  }

  /** 广播解散并断开,随后由调用方从房间表删除 */
  closeNow(reason = 'expired') {
    for (const s of [this.seats.red, this.seats.black]) {
      if (s?.conn) sendWS(s.conn, { t: 'closed', reason });
    }
    this.dispose();
  }

  finish(result: GameResult) {
    this.game.status = 'over';
    this.game.result = result;
    this.closeAt = Date.now() + OVER_TTL_MS; // 结算后保留一段时间供复盘/再来一局
    if (!this.recorded) {
      this.recorded = true;
      void appendRecord({
        room: this.code,
        opts: this.opts,
        startedAt: this.startedAt,
        endedAt: Date.now(),
        result,
        plies: this.game.history.map(({ key: _k, ...rest }) => rest),
      });
    }
    this.touch();
    this.broadcast();
  }

  /** 周期巡检:断线超限判负 + 时钟超时判负 */
  watchdog(now: number) {
    if (this.phaseOf() !== 'playing') return;
    for (const s of ['red', 'black'] as const) {
      const seat = this.seats[s];
      if (seat && !seat.conn && now - seat.lastSeen > ABANDON_MS) {
        this.finish({ reason: 'timeout', winner: other(s) });
        return;
      }
    }
    if (this.clock) {
      const c = this.clock[this.game.turn]!;
      if (now - c.turnStart >= c.ms) this.finish({ reason: 'timeout', winner: other(this.game.turn) });
    }
  }

  dispose() {
    for (const s of [this.seats.red, this.seats.black]) {
      if (s?.conn) {
        try { s.conn.close(); } catch { /* ignore */ }
        s.conn = null;
      }
    }
  }
}
