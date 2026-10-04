<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { net } from '../net';
import { leaveRoom, showToast, store } from '../store';
import Board from '../components/Board.vue';

const st = computed(() => store.state);
const you = computed(() => store.you);
const link = computed(() => `${location.origin}/?r=${store.room}`);
const menuOpen = ref(false);

function copyText(text: string, ok: string) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => showToast(ok), () => showToast(text));
}
function copyLink() {
  copyText(link.value, '链接已复制,发给朋友吧');
}
function copyCode() {
  copyText(store.room, '房号已复制');
}
function onMove(from: number, to: number) {
  net.send({ t: 'move', from, to });
}
function fmt(ms?: number) {
  if (ms == null) return '';
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function seatOf(side: 'me' | 'opp') {
  const s = st.value;
  if (!s || !you.value) return null;
  if (side === 'me') return you.value === 'red' ? s.seats.red : s.seats.black;
  return you.value === 'red' ? s.seats.black : s.seats.red;
}
const oppOnline = computed(() => !!seatOf('opp')?.online);
const oppClock = computed(() => {
  const s = st.value;
  if (!s?.clocks || !you.value) return undefined;
  return you.value === 'red' ? s.clocks.black : s.clocks.red;
});
const myClock = computed(() => {
  const s = st.value;
  if (!s?.clocks || !you.value) return undefined;
  return you.value === 'red' ? s.clocks.red : s.clocks.black;
});

const resultText = computed(() => {
  const r = st.value?.result;
  if (!r || !st.value) return '';
  const why: Record<string, string> = {
    mate: '绝杀',
    stalemate: '困毙',
    timeout: '超时',
    resign: '认输',
    agreement: '协议和棋',
    repetition: '三次重复局面判和',
    perpetual: '长将判负',
    no_capture: '六十回合无吃子判和',
  };
  if (r.winner === null) return `和棋 · ${why[r.reason] ?? r.reason}`;
  return `${r.winner === you.value ? '你赢了 🎉' : '你输了'} · ${why[r.reason] ?? r.reason}`;
});
const resultTone = computed(() => {
  const r = st.value?.result;
  if (!r || r.winner === null) return 'draw';
  return r.winner === you.value ? 'win' : 'lose';
});

const rematchCount = computed(() => {
  const s = st.value;
  if (!s) return 0;
  return Number(s.rematch.red) + Number(s.rematch.black);
});
const iVoted = computed(() => {
  const s = st.value;
  if (!s || !you.value) return false;
  return s.rematch[you.value];
});
const rematchLabel = computed(() => {
  if (iVoted.value) return '等待对方同意…';
  return rematchCount.value ? `再来一局(${rematchCount.value}/2)` : '再来一局';
});

// 对手掉线倒计时(与服务端 60s 宽限一致)
const ABANDON_SECONDS = 60;
const offlineAt = ref(0);
const nowTick = ref(0);
let tickTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  tickTimer = setInterval(() => (nowTick.value += 1), 1000);
});
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
watch(oppOnline, (on, was) => {
  if (was && !on) offlineAt.value = Date.now();
  if (on) offlineAt.value = 0;
});
const abandonText = computed(() => {
  void nowTick.value;
  if (!offlineAt.value) return '60 秒内未回归将判你胜';
  const left = ABANDON_SECONDS - Math.floor((Date.now() - offlineAt.value) / 1000);
  return left > 0 ? `${left}s 后判你胜` : '等待判定…';
});

// 结算弹窗可关闭查看棋盘;关闭后底部保留再来一局入口
const resultDismissed = ref(false);
watch(
  () => st.value?.phase,
  (p) => {
    if (p !== 'over') resultDismissed.value = false;
  },
);

// ---------- 房主/退出/解散 ----------
const isOwner = computed(() => {
  const s = st.value;
  return !!s && !!you.value && s.owner === you.value;
});
function exitRoom() {
  if (isOwner.value) {
    if (confirm('解散房间?所有对局将结束。')) {
      net.send({ t: 'dissolve' });
      setTimeout(() => {
        if (store.screen === 'room') leaveRoom();
      }, 1500);
    }
    return;
  }
  const playing = st.value?.phase === 'playing';
  if (playing && !confirm('退出将视为认输,确定退出?')) return;
  net.send({ t: 'leave' });
  setTimeout(() => {
    if (store.screen === 'room') leaveRoom();
  }, 200);
}
function resign() {
  if (confirm('确定认输?')) net.send({ t: 'resign' });
}

// ---------- 悔棋 ----------
const undoDisabled = computed(() => {
  const s = st.value;
  if (!s || !you.value) return true;
  if (s.phase !== 'playing' || s.moveNum === 0) return true;
  if (s.pendingUndo) return true;
  return s.turn === you.value; // 自己是最后一着 = 对方还没回手
});
const undoLabel = computed(() => (st.value?.pendingUndo === you.value ? '等待对方同意…' : '悔棋'));
function onUndo() {
  net.send({ t: 'undo_request' });
  menuOpen.value = false;
}
</script>

<template>
  <div class="room" v-if="st">
    <header>
      <button class="ghost" @click="exitRoom">{{ isOwner ? '解散' : '退出' }}</button>
      <div class="code">房号 <b>{{ store.room }}</b></div>
      <div class="menu-wrap">
        <button class="ghost" @click="menuOpen = !menuOpen">更多 ▾</button>
        <div class="menu" v-if="menuOpen">
          <template v-if="st.phase === 'playing'">
            <button :disabled="undoDisabled" @click="onUndo">{{ undoLabel }}</button>
            <button :disabled="!!st.drawOffer" @click="net.send({ t: 'draw_offer' }); menuOpen = false">
              {{ st.drawOffer === you ? '已请求和棋…' : '求和' }}
            </button>
            <button class="danger" @click="resign(); menuOpen = false">认输</button>
          </template>
          <template v-else>
            <button @click="copyLink(); menuOpen = false">复制邀请链接</button>
            <span class="menu-empty">对局开始后可使用悔棋 / 求和 / 认输</span>
          </template>
        </div>
        <div class="menu-mask" v-if="menuOpen" @click="menuOpen = false"></div>
      </div>
    </header>

    <div class="bar">
      <span class="seat"><i class="pind" :class="{ ok: oppOnline }"></i>{{ seatOf('opp')?.nick ?? '等待中…' }}</span>
      <span v-if="st.clocks && st.phase !== 'waiting'" class="clock" :class="{ act: st.turn !== you && st.phase === 'playing' }">{{ fmt(oppClock) }}</span>
    </div>

    <div class="warn" v-if="st.phase === 'playing' && !oppOnline">⚠ 对方掉线 · {{ abandonText }}</div>
    <div class="pend" v-if="st.pendingUndo && st.pendingUndo !== you">
      对方请求悔棋
      <button @click="net.send({ t: 'undo_accept' });">同意</button>
      <button @click="net.send({ t: 'undo_decline' })">拒绝</button>
    </div>
    <div class="pend" v-if="st.drawOffer && st.drawOffer !== you">
      对方请求和棋
      <button @click="net.send({ t: 'draw_accept' })">同意</button>
      <button @click="net.send({ t: 'draw_decline' })">拒绝</button>
    </div>

    <Board :state="st" :you="you" @move="onMove" />

    <div class="bar">
      <span class="seat" :class="{ turn: st.turn === you && st.phase === 'playing' }">{{ seatOf('me')?.nick ?? '—' }}</span>
      <span class="connstate"><i class="pind" :class="{ ok: store.connected }"></i>{{ store.connected ? '已连接' : '重连中…' }}</span>
      <span v-if="st.clocks && st.phase !== 'waiting'" class="clock" :class="{ act: st.turn === you && st.phase === 'playing' }">{{ fmt(myClock) }}</span>
    </div>

    <div class="actions" v-if="st.phase === 'waiting'">
      <span class="hint">把 6 位数字房号或邀请链接发给对手,加入即开局</span>
    </div>

    <div v-if="st.phase === 'waiting'" class="overlay">
      <div class="card">
        <div class="big">{{ store.room }}</div>
        <p>把数字房号或链接发给对手,对方加入即开局</p>
        <div class="linkrow">
          <input readonly :value="link" @focus="($event.target as HTMLInputElement).select()" />
          <button @click="copyLink">复制链接</button>
        </div>
        <div class="linkrow">
          <input readonly :value="store.room" @focus="($event.target as HTMLInputElement).select()" />
          <button @click="copyCode">复制房号</button>
        </div>
        <div class="wait">等待对手加入…</div>
      </div>
    </div>

    <div class="actions" v-if="st.phase === 'over' && resultDismissed">
      <button class="primary" :disabled="iVoted" @click="net.send({ t: 'rematch' })">{{ rematchLabel }}</button>
      <button @click="resultDismissed = false">回看结算</button>
      <button @click="leaveRoom">回主页</button>
    </div>

    <transition name="fade">
      <div v-if="st.phase === 'over' && !resultDismissed" class="overlay result-ov">
        <div class="result-card">
          <div class="result-title" :class="resultTone">{{ resultText }}</div>
          <div class="result-sub">本局共 {{ st.moveNum }} 步</div>
          <div class="result-btns">
            <button class="primary" :disabled="iVoted" @click="net.send({ t: 'rematch' })">{{ rematchLabel }}</button>
            <button @click="resultDismissed = true">查看棋盘</button>
          </div>
          <div class="result-tip">关闭弹窗可复盘棋盘,底部保留"再来一局"入口</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.room {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  position: relative;
  z-index: 30;
}
.code {
  font-size: 14px;
  color: #9aa5b8;
}
.code b {
  color: #e8e4da;
  letter-spacing: 2px;
  font-size: 16px;
}
.menu-wrap {
  position: relative;
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  background: #1d2432;
  border: 1px solid #2a3346;
  border-radius: 12px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  z-index: 40;
}
.menu button {
  text-align: left;
  background: transparent;
  border-color: transparent;
}
.menu button:hover:not(:disabled) {
  background: #232b3a;
}
.menu .menu-empty {
  display: block;
  padding: 8px 10px;
  font-size: 12px;
  color: #8a94a8;
  max-width: 190px;
}
.menu-mask {
  position: fixed;
  inset: 0;
  z-index: 25;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px;
  font-size: 14px;
  min-height: 32px;
}
.seat {
  flex: 1;
  transition: color 0.2s;
}
.seat.turn {
  color: #d9a514;
  font-weight: 700;
}
.connstate {
  color: #8a94a8;
  font-size: 12px;
  flex: 1;
  text-align: right;
  margin-right: 10px;
}
.clock {
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  color: #8a94a8;
  min-width: 48px;
  text-align: right;
}
.clock.act {
  color: #e8e4da;
  font-weight: 700;
}
.warn,
.pend {
  margin: 2px 10px;
  padding: 7px 12px;
  border-radius: 10px;
  font-size: 13px;
  text-align: center;
}
.warn {
  border: 1px solid #6b5316;
  background: #322a12;
  color: #e8c15a;
  animation: pulse 1.6s ease-in-out infinite;
}
.pend {
  border: 1px solid #2b5566;
  background: #14262f;
  color: #7cc7de;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.pend button {
  padding: 4px 12px;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 10px 0 18px;
  margin-top: auto;
}
.actions .hint {
  color: #8a94a8;
  font-size: 13px;
  align-self: center;
}
.closehint {
  min-height: 1px;
}
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 20, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  animation: fadein 0.35s ease;
}
@keyframes fadein {
  from {
    opacity: 0;
  }
}
.result-card {
  background: #1d2432;
  border: 1px solid #2a3346;
  border-radius: 16px;
  padding: 28px 32px;
  width: min(90vw, 400px);
  text-align: center;
  animation: popin 0.45s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes popin {
  0% {
    transform: scale(0.7);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
.result-title {
  font-size: 26px;
  font-weight: 800;
  margin-bottom: 6px;
}
.result-title.win {
  color: #6fd598;
  text-shadow: 0 0 18px rgba(111, 213, 152, 0.45);
}
.result-title.lose {
  color: #e58a8a;
}
.result-title.draw {
  color: #e8c15a;
}
.result-sub {
  color: #8a94a8;
  font-size: 13px;
  margin-bottom: 18px;
}
.result-tip {
  margin-top: 12px;
  color: #6b7280;
  font-size: 12px;
}
.result-btns {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.linkrow {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.linkrow button {
  white-space: nowrap;
}
.wait {
  margin-top: 14px;
  color: #8a94a8;
  font-size: 13px;
  animation: pulse 1.6s ease-in-out infinite;
}
.ttl {
  margin-top: 8px;
  color: #6b7280;
  font-size: 12px;
}
.card .big {
  font-size: 44px;
  letter-spacing: 10px;
  font-weight: 800;
  color: #d9a514;
  margin-bottom: 8px;
}
.card p {
  color: #9aa5b8;
  font-size: 13px;
  margin-bottom: 14px;
}
@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}
</style>
