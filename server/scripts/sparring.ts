/**
 * 陪练机器人:加入指定房间执黑(或 --create 建房执红),每 1.2 秒回一步随机合法着法。
 * 用法: npx tsx scripts/sparring.ts <房码|--create> [昵称]
 */
import { WebSocket } from 'ws';
import { boardFromView, legalTargets, type ClientMsg, type GameState, type Side } from '@jieqi/shared';

const room = process.argv[2];
const nick = process.argv[3] ?? '陪练';
const createMode = room === '--create';
if (!room) {
  console.error('用法: npx tsx scripts/sparring.ts <房码|--create> [昵称]');
  process.exit(1);
}

const ws = new WebSocket('ws://127.0.0.1:3190/ws');
let state: GameState | null = null;
let mySide: Side | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const send = (m: ClientMsg) => ws.send(JSON.stringify(m));

function schedule() {
  if (timer || !state || !mySide) return;
  if (state.phase !== 'playing' || state.turn !== mySide) return;
  timer = setTimeout(() => {
    timer = null;
    if (!state || !mySide) return;
    const board = boardFromView(state.cells);
    const moves: [number, number][] = [];
    for (let i = 0; i < 90; i++) {
      for (const t of legalTargets(board, mySide, i)) moves.push([i, t]);
    }
    if (!moves.length || state.phase !== 'playing') return;
    const [from, to] = moves[Math.floor(Math.random() * moves.length)]!;
    console.log(`[bot] ${mySide} ${from} -> ${to}`);
    send({ t: 'move', from, to });
  }, 1200);
}

ws.on('open', () => {
  if (createMode) send({ t: 'create', nick });
  else send({ t: 'join', room: room.toUpperCase(), nick });
});
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'joined') {
    mySide = m.you;
    state = m.state;
    console.log(`[bot] 房间 ${m.room},执${mySide === 'red' ? '红' : '黑'}`);
    schedule();
  } else if (m.t === 'state') {
    const s = m.state as GameState;
    state = s;
    if (s.phase === 'over') console.log(`[bot] 对局结束: ${s.result?.reason}`);
    else schedule();
  } else if (m.t === 'error') {
    console.error('[bot] 错误:', m.code);
  }
});
ws.on('close', () => process.exit(0));
