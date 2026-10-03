/**
 * 端到端联调:自行拉起服务器(独立端口),用两个 ws 客户端打完整流程。
 * 覆盖:建房/加入/开局、暗子保密红线、随机整局、非法步拒绝、超时判负、断线重连、再来一局换先。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import {
  boardFromView, legalTargets,
  type ClientMsg, type GameState, type PublicCell, type ServerMsg,
} from '@jieqi/shared';

const PORT = 3191;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

let pass = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('  ✓', name);
  } else {
    fails.push(name);
    console.error('  ✗', name, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

class Client {
  ws: WebSocket;
  private buf: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (raw) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) {
        const [w] = this.waiters.splice(i, 1);
        w.res(m);
      } else {
        this.buf.push(m);
      }
    });
  }

  static connect(): Promise<Client> {
    return new Promise((res, rej) => {
      const ws = new WebSocket(WS_URL);
      ws.on('open', () => res(new Client(ws)));
      ws.on('error', rej);
    });
  }

  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }

  next(pred: (m: ServerMsg) => boolean, timeoutMs = 8000): Promise<ServerMsg> {
    const i = this.buf.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.buf.splice(i, 1)[0]!);
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('等待消息超时')), timeoutMs);
      this.waiters.push({
        pred,
        res: (m) => {
          clearTimeout(t);
          res(m);
        },
      });
    });
  }

  close() {
    this.ws.close();
  }

  /** 清空未消费的缓冲消息(阶段切换时避免旧消息干扰断言) */
  drain() {
    this.buf.length = 0;
  }
}

/** 暗子保密红线:视图里暗子绝不允许出现 type 字段 */
function assertRedacted(name: string, state: GameState): { dark: number; revealed: number } {
  const cells = state.cells as PublicCell[];
  let dark = 0;
  let revealed = 0;
  let leaked = false;
  for (const c of cells) {
    if (!c) continue;
    if (c.revealed) {
      revealed++;
      continue;
    }
    dark++;
    if ('type' in c) leaked = true;
  }
  ok(!leaked, `${name}: 暗子零泄漏(暗${dark}/明${revealed})`);
  return { dark, revealed };
}

async function main() {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));
  child.stderr.on('data', (d) => process.stderr.write('[srv:err] ' + d));

  let first: Client | null = null;
  for (let i = 0; i < 60 && !first; i++) {
    await new Promise((r) => setTimeout(r, 200));
    first = await Client.connect().catch(() => null);
  }
  if (!first) throw new Error('服务器未能启动');

  console.log('— 建房 / 加入 / 开局 —');
  first.send({ t: 'create', nick: '甲方', opts: { baseMin: 1, incSec: 1 } });
  const ja = (await first.next((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
  const room = ja.room;
  ok(room.length === 6, `建房得到房码 ${room}`);
  ok(ja.state.phase === 'waiting', '创建后等待对手');
  ok(ja.you === 'red', '创建者执红');

  const b = await Client.connect();
  b.send({ t: 'join', room, nick: '乙方' });
  const jb = (await b.next((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
  ok(jb.you === 'black', '后加入执黑');
  ok(jb.state.phase === 'playing', '双方就绪直接开局');
  const sa = (await first.next((m) => m.t === 'state' && m.state.phase === 'playing')) as Extract<ServerMsg, { t: 'state' }>;

  const r0 = assertRedacted('开局视图(红)', ja.you === 'red' ? jb.state : jb.state);
  ok(r0.revealed === 2, '初始只有两枚明帅/将');
  ok(r0.dark === 30, '30 枚暗子');
  assertRedacted('开局视图(黑)', jb.state);
  ok(sa.state.turn === 'red', '红先行');

  console.log('— 随机整局(每步校验保密与揭示一致)—');
  let cur = sa.state;
  let plies = 0;
  while (cur.phase === 'playing' && plies < 220) {
    const side = cur.turn;
    const who = side === 'red' ? first : b;
    const board = boardFromView(cur.cells);
    const moves: [number, number][] = [];
    for (let i = 0; i < 90; i++) {
      for (const t of legalTargets(board, side, i)) moves.push([i, t]);
    }
    if (moves.length === 0) break;
    const [from, to] = moves[Math.floor(Math.random() * moves.length)]!;
    who.send({ t: 'move', from, to });
    const inc = cur.moveNum + 1;
    const m1 = (await first.next((m) => m.t === 'state' && m.state.moveNum === inc)) as Extract<ServerMsg, { t: 'state' }>;
    await b.next((m) => m.t === 'state' && m.state.moveNum === inc);
    cur = m1.state;
    plies++;
    assertRedacted(`第${plies}步视图`, cur);
    if (cur.reveal) {
      const c = cur.cells[cur.reveal.pos] as PublicCell;
      ok(!!c && c.revealed && (c as { type?: string }).type === cur.reveal.type, `第${plies}步揭示一致(${cur.reveal.type})`);
    }
    if (cur.phase === 'over') {
      ok(!!cur.result, `随机对局自然结束: ${cur.result?.reason}`);
      break;
    }
  }
  if (cur.phase === 'playing') {
    (cur.turn === 'red' ? first : b).send({ t: 'resign' });
    const mo = (await first.next((m) => m.t === 'state' && m.state.phase === 'over', 5000)) as Extract<ServerMsg, { t: 'state' }>;
    ok(mo.state.result?.reason === 'resign', `步数上限后备认输结束(${plies}步)`);
  }

  console.log('— 对局外非法操作被拒 —');
  first.send({ t: 'move', from: 0, to: 45 });
  const er = (await first.next((m) => m.t === 'error')) as Extract<ServerMsg, { t: 'error' }>;
  ok(['not_playing', 'illegal_move', 'not_your_turn'].includes(er.code), `非法步被拒(${er.code})`);

  console.log('— 超时判负 —');
  const c = await Client.connect();
  c.send({ t: 'create', nick: '超时甲', opts: { baseMin: 0.03, incSec: 0 } });
  const jc = (await c.next((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
  const d = await Client.connect();
  d.send({ t: 'join', room: jc.room, nick: '超时乙' });
  await d.next((m) => m.t === 'joined');
  const ov = (await c.next((m) => m.t === 'state' && m.state.phase === 'over', 15000)) as Extract<ServerMsg, { t: 'state' }>;
  ok(ov.state.result?.reason === 'timeout' && ov.state.result.winner === 'black', '红方超时,判黑胜');

  console.log('— 断线重连 —');
  const e = await Client.connect();
  e.send({ t: 'create', nick: '重连甲' });
  const je = (await e.next((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
  const f = await Client.connect();
  f.send({ t: 'join', room: je.room, nick: '重连乙' });
  await f.next((m) => m.t === 'joined');
  {
    const board = boardFromView(je.state.cells);
    let mv: [number, number] | null = null;
    for (let i = 0; i < 90 && !mv; i++) {
      const ts = legalTargets(board, 'red', i);
      if (ts.length) mv = [i, ts[0]!];
    }
    e.send({ t: 'move', from: mv![0], to: mv![1] });
    await f.next((m) => m.t === 'state' && m.state.moveNum === 1);
  }
  e.close();
  await new Promise((r) => setTimeout(r, 300));
  const e2 = await Client.connect();
  e2.send({ t: 'join', room: je.room, token: je.token });
  const je2 = (await e2.next((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
  ok(je2.you === 'red' && je2.state.moveNum === 1 && je2.state.phase === 'playing', '重连恢复座位与局面');

  console.log('— 再来一局(换先重洗)—');
  await d.next((m) => m.t === 'state' && m.state.phase === 'over');
  c.drain();
  d.drain();
  c.send({ t: 'rematch' });
  await d.next((m) => m.t === 'state' && m.state.rematch.red === true);
  d.send({ t: 'rematch' });
  const ns = (await d.next((m) => m.t === 'state' && m.state.phase === 'playing', 8000)) as Extract<ServerMsg, { t: 'state' }>;
  ok(ns.state.moveNum === 0, '新对局步数归零');
  const revealedCount = ns.state.cells.filter((x) => x?.revealed).length;
  ok(revealedCount === 2, '新对局重新洗子(只剩两枚明帅/将)');
  ok(ns.you === 'red', '原黑方重开后执红(换先)');

  console.log(`\n结果:通过 ${pass} 项,失败 ${fails.length} 项`);
  if (fails.length) console.error('失败项:', fails);
  child.kill();
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
