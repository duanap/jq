import { reactive } from 'vue';
import type { GameState, ServerMsg, Side } from '@jieqi/shared';
import { net } from './net';

export const store = reactive({
  screen: 'home' as 'home' | 'room',
  nick: localStorage.getItem('jieqi.nick') ?? '',
  joinCode: '',
  room: '',
  token: '',
  you: null as Side | null,
  state: null as GameState | null,
  connected: false,
  toast: '',
  autoJoin: '',
});

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function showToast(msg: string) {
  store.toast = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (store.toast = ''), 3000);
}

export function createRoom() {
  const nick = store.nick.trim();
  if (!nick) return showToast('先填个昵称');
  localStorage.setItem('jieqi.nick', nick);
  net.send({ t: 'create', nick });
}

export function joinRoom() {
  const nick = store.nick.trim();
  const code = store.joinCode.trim().toUpperCase();
  // 本地已有该房间的 token:优先走恢复(服务端 token 不匹配才会按新玩家入座)
  const token = localStorage.getItem('jieqi.token.' + code) ?? undefined;
  if (!nick && !token) return showToast('先填个昵称');
  if (!/^[A-Z2-9]{6}$/.test(code)) return showToast('房码是 6 位字母数字');
  if (nick) localStorage.setItem('jieqi.nick', nick);
  net.send({ t: 'join', room: code, nick: nick || undefined, token });
}

export function leaveRoom() {
  localStorage.removeItem('jieqi.last');
  localStorage.removeItem('jieqi.token.' + store.room);
  store.autoJoin = '';
  net.close();
  store.screen = 'home';
  store.state = null;
  store.you = null;
  store.room = '';
  store.token = '';
  net.connect();
}

export function onNetOpen() {
  // 页面刷新/断线后自动回到对局
  if (store.screen === 'room' && store.room && store.token) {
    net.send({ t: 'join', room: store.room, token: store.token });
    return;
  }
  if (store.autoJoin) {
    const room = store.autoJoin;
    store.autoJoin = '';
    net.send({ t: 'join', room, token: localStorage.getItem('jieqi.token.' + room) ?? undefined });
  }
}

function errorText(code: string): string {
  const map: Record<string, string> = {
    no_room: '房间不存在或已解散',
    room_full: '房间已满',
    illegal_move: '不合法的走法',
    not_your_turn: '还没轮到你',
    not_playing: '对局不在进行中',
    not_over: '对局还没结束',
    draw_pending: '已有和棋请求待处理',
    no_draw_offer: '没有待处理的和棋请求',
    bad_move: '走法格式错误',
  };
  return map[code] ?? `出错:${code}`;
}

export function applyServerMsg(m: ServerMsg) {
  switch (m.t) {
    case 'joined': {
      store.room = m.room;
      store.token = m.token;
      store.you = m.you;
      store.state = m.state;
      localStorage.setItem('jieqi.token.' + m.room, m.token);
      localStorage.setItem('jieqi.last', m.room);
      store.screen = 'room';
      break;
    }
    case 'state':
      if (m.you) store.you = m.you;
      store.state = m.state;
      break;
    case 'closed': {
      // 服务端解散房间(生命周期到期):清记录回主页
      showToast(m.reason === 'expired' ? '房间已解散(超时无活动)' : '房间已解散');
      localStorage.removeItem('jieqi.last');
      localStorage.removeItem('jieqi.token.' + store.room);
      store.autoJoin = '';
      store.screen = 'home';
      store.state = null;
      store.you = null;
      store.room = '';
      store.token = '';
      break;
    }
    case 'error':
      // 本地记录的房间已不存在(服务重启/过期)时清掉,避免每次打开都报错
      if (m.code === 'no_room' && store.screen === 'home') {
        const last = localStorage.getItem('jieqi.last');
        if (last) {
          localStorage.removeItem('jieqi.last');
          localStorage.removeItem('jieqi.token.' + last);
        }
        store.autoJoin = '';
      }
      showToast(errorText(m.code));
      break;
    case 'pong':
      break;
  }
}
