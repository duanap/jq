import { WebSocket } from 'ws';
import { boardFromView, legalTargets } from '@jieqi/shared';
const ws = new WebSocket('ws://127.0.0.1:3191/ws');
let state = null;
ws.on('open', () => { ws.send(JSON.stringify({ t: 'create', nick: '调试' })); });
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'joined' && !state) {
    state = m.state;
    const board = boardFromView(state.cells);
    let counts = {};
    let total = 0;
    for (let i = 0; i < 90; i++) {
      const n = legalTargets(board, 'red', i).length;
      if (n) { counts[i] = n; total += n; }
    }
    console.log('turn:', state.turn, 'red可行手数:', total, JSON.stringify(counts));
    process.exit(0);
  }
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
