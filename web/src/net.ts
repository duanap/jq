import type { ClientMsg, ServerMsg } from '@jieqi/shared';

type MsgHandler = (m: ServerMsg) => void;

/**
 * 极简 ws 客户端:
 * - 自动重连(指数退避),重连后由上层用 token 重新 join 恢复;
 * - 未连接时发送进队列,连接建立后补发;
 * - 应用层心跳(10s ping / 5s 未收到 pong 判定死链主动重连)。
 */
class Net {
  private ws: WebSocket | null = null;
  private msgHandlers = new Set<MsgHandler>();
  private statusHandlers = new Set<(ok: boolean) => void>();
  private openHandlers = new Set<() => void>();
  private queue: ClientMsg[] = [];
  private retryDelay = 1000;
  private closedByUser = false;
  private hbTimer: ReturnType<typeof setInterval> | null = null;
  private hbWait: ReturnType<typeof setTimeout> | null = null;
  connected = false;

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.closedByUser = false;
    this.open();
  }

  private open() {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retryDelay = 1000;
      this.statusHandlers.forEach((h) => h(true));
      const q = this.queue;
      this.queue = [];
      q.forEach((m) => this.send(m));
      this.openHandlers.forEach((h) => h());
      this.startHeartbeat();
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.t === 'pong') this.clearHbWait();
      this.msgHandlers.forEach((h) => h(m));
    };
    ws.onclose = () => {
      this.connected = false;
      this.stopHeartbeat();
      this.statusHandlers.forEach((h) => h(false));
      if (!this.closedByUser) {
        setTimeout(() => this.open(), this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, 10000);
      }
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* ignore */ }
    };
  }

  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else {
      this.queue.push(m);
      this.connect();
    }
  }

  close() {
    this.closedByUser = true;
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  onMessage(h: MsgHandler) { this.msgHandlers.add(h); }
  onStatus(h: (ok: boolean) => void) { this.statusHandlers.add(h); }
  onOpen(h: () => void) { this.openHandlers.add(h); }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.hbTimer = setInterval(() => {
      this.send({ t: 'ping' });
      this.clearHbWait();
      this.hbWait = setTimeout(() => {
        try { this.ws?.close(); } catch { /* ignore */ }
      }, 12000);
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = null;
    this.clearHbWait();
  }

  private clearHbWait() {
    if (this.hbWait) clearTimeout(this.hbWait);
    this.hbWait = null;
  }
}

export const net = new Net();
