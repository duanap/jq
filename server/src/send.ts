import type { WebSocket } from 'ws';
import type { ServerMsg } from '@jieqi/shared';

export function sendWS(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch { /* 连接正关,丢弃 */ }
  }
}
