import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, TimeOpts } from '@jieqi/shared';
import { allRooms, createRoom, getRoom, sweepExpired } from './rooms';
import type { Room } from './room';
import { CLOCK_TICK_MS, HB_INTERVAL_MS, PORT } from './config';
import { sendWS } from './send';
import { here } from './env';

// ---------- 静态资源(可选:Nginx 托管时同效果) ----------
const webDist = path.resolve(here, '../../web/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200);
      res.end('ok');
      return;
    }
    let rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel === '' || rel === '.') rel = 'index.html';
    const file = path.join(webDist, rel);
    if (!file.startsWith(webDist)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      // SPA 回退
      const index = await fs.readFile(path.join(webDist, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html']! });
      res.end(index);
    }
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('前端未构建:请先运行 npm run build');
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws' });

interface Ctx {
  room: Room;
  side: 'red' | 'black';
}
const ctxOf = (ws: WebSocket): Ctx | undefined => (ws as { _ctx?: Ctx })._ctx;

wss.on('connection', (ws) => {
  (ws as { _alive?: boolean })._alive = true;
  ws.on('pong', () => {
    (ws as { _alive?: boolean })._alive = true;
    const c = ctxOf(ws);
    if (c) {
      const s = c.room.seats[c.side];
      if (s) s.lastSeen = Date.now();
    }
  });
  ws.on('message', (raw) => {
    (ws as { _alive?: boolean })._alive = true; // 应用层任何消息都算存活(部分内核不回协议 pong)
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof (msg as { t?: unknown }).t !== 'string') return;
    try {
      handle(ws, msg);
    } catch (e) {
      console.error('[jieqi] 消息处理异常', e);
    }
  });
  ws.on('close', () => {
    const c = ctxOf(ws);
    if (c) c.room.detach(c.side, ws);
  });
  ws.on('error', () => { /* close 会跟进 */ });
});

function sanitizeNick(n: unknown): string {
  const s = String(n ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
  return s || '玩家';
}

function sanitizeOpts(o: unknown): TimeOpts {
  const src = (o ?? {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return { baseMin: num(src.baseMin, 0, 120, 10), incSec: num(src.incSec, 0, 60, 3) };
}

function handle(ws: WebSocket, msg: ClientMsg) {
  const ctx = ctxOf(ws);
  const m = msg as Record<string, unknown> & { t: string };

  switch (m.t) {
    case 'ping':
      sendWS(ws, { t: 'pong' });
      return;

    case 'create': {
      const room = createRoom(sanitizeOpts(m.opts));
      const seat = room.newSeat('red', sanitizeNick(m.nick));
      room.seats.red = seat;
      room.attach(seat, ws);
      room.touch();
      console.log(`[room] create ${room.code}`);
      sendWS(ws, room.joinedMsg(seat));
      return;
    }

    case 'join': {
      const code = String(m.room ?? '').toUpperCase();
      const room = getRoom(code);
      if (!room) {
        console.log(`[room] join ${code} -> no_room`);
        sendWS(ws, { t: 'error', code: 'no_room' });
        return;
      }
      const token = typeof m.token === 'string' ? m.token : undefined;
      if (token) {
        const seat = [room.seats.red, room.seats.black].find((s) => s?.token === token);
        if (seat) {
          room.attach(seat, ws);
          room.touch();
          console.log(`[room] join ${code} -> restore`);
          sendWS(ws, room.joinedMsg(seat));
          return;
        }
        console.log(`[room] join ${code} -> token 不匹配`);
      }
      const free: 'red' | 'black' | null = !room.seats.red ? 'red' : !room.seats.black ? 'black' : null;
      if (!free) {
        console.log(`[room] join ${code} -> full`);
        sendWS(ws, { t: 'error', code: 'room_full' });
        return;
      }
      const seat = room.newSeat(free, sanitizeNick(m.nick));
      room.seats[free] = seat;
      room.attach(seat, ws);
      room.touch();
      if (room.phaseOf() === 'playing') room.startClocks();
      sendWS(ws, room.joinedMsg(seat));
      room.broadcast(); // 通知对方:对手已入座/开局
      return;
    }
  }

  // 以下消息要求已入座
  if (!ctx) return;
  const seat = ctx.room.seats[ctx.side];
  if (seat) seat.lastSeen = Date.now();

  switch (m.t) {
    case 'move': {
      const from = m.from as unknown;
      const to = m.to as unknown;
      if (
        !Number.isInteger(from) || !Number.isInteger(to) ||
        (from as number) < 0 || (from as number) > 89 ||
        (to as number) < 0 || (to as number) > 89
      ) {
        sendWS(ws, { t: 'error', code: 'bad_move' });
        return;
      }
      const err = ctx.room.onMove(ctx.side, from as number, to as number);
      if (err) sendWS(ws, { t: 'error', code: err });
      return;
    }
    case 'resign': {
      const err = ctx.room.resign(ctx.side);
      if (err) sendWS(ws, { t: 'error', code: err });
      return;
    }
    case 'draw_offer': {
      const err = ctx.room.offerDraw(ctx.side);
      if (err) sendWS(ws, { t: 'error', code: err });
      return;
    }
    case 'draw_accept': {
      const err = ctx.room.acceptDraw(ctx.side);
      if (err) sendWS(ws, { t: 'error', code: err });
      return;
    }
    case 'draw_decline': {
      const err = ctx.room.declineDraw(ctx.side);
      if (err) sendWS(ws, { t: 'error', code: err });
      return;
    }
    case 'rematch': {
      const err = ctx.room.rematchVote(ctx.side);
      if (err) sendWS(ws, { t: 'error', code: err });
      return;
    }
  }
}

// ---------- 周期任务 ----------
setInterval(() => {
  for (const ws of wss.clients) {
    if (!(ws as { _alive?: boolean })._alive) {
      ws.terminate();
      continue;
    }
    (ws as { _alive?: boolean })._alive = false;
    ws.ping();
  }
}, HB_INTERVAL_MS);

setInterval(() => {
  const now = Date.now();
  for (const r of allRooms()) r.watchdog(now);
}, CLOCK_TICK_MS);

// 房间生命周期清扫(等待限时/结算保留期/对局僵死兜底)
setInterval(() => sweepExpired(Date.now()), 1000).unref();

server.listen(PORT, () => {
  console.log(`[jieqi] 游戏服务已启动 :${PORT},静态目录 ${webDist}`);
});
