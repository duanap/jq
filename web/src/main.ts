import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { net } from './net';
import { applyServerMsg, onNetOpen, store } from './store';

createApp(App).mount('#app');

net.onMessage(applyServerMsg);
net.onStatus((ok) => (store.connected = ok));
net.onOpen(onNetOpen);
net.connect();

// URL 带 ?r=房码 → 预填加入;否则若本地有未完成对局 → 自动回到对局
const r = new URLSearchParams(location.search).get('r');
if (r) {
  store.joinCode = r.toUpperCase();
  history.replaceState(null, '', location.pathname + location.hash);
} else {
  const last = localStorage.getItem('jieqi.last');
  const token = last && localStorage.getItem('jieqi.token.' + last);
  if (last && token) store.autoJoin = last;
}
