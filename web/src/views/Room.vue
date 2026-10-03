<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { net } from '../net';
import { leaveRoom, showToast, store } from '../store';
import Board from '../components/Board.vue';

const st = computed(() => store.state);
const you = computed(() => store.you);
const link = computed(() => `${location.origin}/?r=${store.room}`);

function copyText(text: string, ok: string) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => showToast(ok), () => showToast(text));
}
function copyLink() {
  copyText(link.value, '链接已复制,发给朋友吧');
}
function copyCode() {
  copyText(store.room, '房码已复制');
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

/** 居中醒目状态条:文案 + 配色 + 是否脉冲 */
const stateInfo = computed(() => {
  const s = st.value;
  if (!s) return { text: '', tone: 'idle', pulse: false };
  if (s.phase === 'waiting') return { text: '等待对手加入…', tone: 'idle', pulse: true };
  if (s.phase === 'over')
    return { text: resultText.value || '对局结束', tone: resultTone.value, pulse: false };
  if (s.drawOffer && s.drawOffer !== you.value)
    return { text: '对方请求和棋', tone: 'notice', pulse: true };
  if (s.drawOffer === you.value)
    return { text: '已请求和棋,等待对方…', tone: 'idle', pulse: false };
  if (s.turn === you.value)
    return s.check
      ? { text: '轮到你 · 将军!', tone: 'danger', pulse: true }
      : { text: '轮到你走子', tone: 'myturn', pulse: false };
  return s.check
    ? { text: '对方被将军', tone: 'danger', pulse: false }
    : { text: '等待对方走子…', tone: 'idle', pulse: false };
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

// 房间生命周期倒计时(等待期/结算保留期)
const closeLeft = computed(() => {
  void nowTick.value;
  const s = st.value;
  if (!s?.closeAt) return null;
  const left = s.closeAt - Date.now();
  if (left <= 0) return '即将解散';
  const m = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  return m > 0 ? `${m} 分 ${sec} 秒` : `${sec} 秒`;
});

function resign() {
  if (confirm('确定认输?')) net.send({ t: 'resign' });
}
function oppName() {
  const o = seatOf('opp');
  return o ? o.nick : '等待中…';
}
</script>

<template>
  <div class="room" v-if="st">
    <header>
      <button class="ghost" @click="leaveRoom">← 退出</button>
      <div class="code">房码 <b>{{ store.room }}</b></div>
      <button class="ghost" @click="copyLink">复制邀请</button>
    </header>

    <div class="bar">
      <span class="seat"><i class="pind" :class="{ ok: oppOnline }"></i>{{ oppName() }}</span>
      <span v-if="st.clocks && st.phase !== 'waiting'" class="clock" :class="{ act: st.turn !== you && st.phase === 'playing' }">{{ fmt(oppClock) }}</span>
    </div>

    <div class="state" :class="[stateInfo.tone, { pulse: stateInfo.pulse }]">{{ stateInfo.text }}</div>

    <div class="warn" v-if="st.phase === 'playing' && !oppOnline">⚠ 对方掉线 · {{ abandonText }}</div>

    <Board :state="st" :you="you" @move="onMove" />

    <div class="bar">
      <span class="seat" :class="{ turn: st.turn === you && st.phase === 'playing' }">{{ seatOf('me')?.nick ?? '—' }}</span>
      <span class="connstate"><i class="pind" :class="{ ok: store.connected }"></i>{{ store.connected ? '已连接' : '重连中…' }}</span>
      <span v-if="st.clocks && st.phase !== 'waiting'" class="clock" :class="{ act: st.turn === you && st.phase === 'playing' }">{{ fmt(myClock) }}</span>
    </div>

    <div class="actions" v-if="st.phase === 'playing'">
      <template v-if="st.drawOffer && st.drawOffer !== you">
        <button class="primary" @click="net.send({ t: 'draw_accept' })">接受和棋</button>
        <button @click="net.send({ t: 'draw_decline' })">拒绝</button>
      </template>
      <template v-else>
        <button @click="net.send({ t: 'draw_offer' })">求和</button>
        <button class="danger" @click="resign">认输</button>
      </template>
    </div>
    <div class="actions" v-else-if="st.phase === 'over'">
      <button class="primary" :disabled="iVoted" @click="net.send({ t: 'rematch' })">
        {{ iVoted ? '等待对方同意…' : '再来一局' }}{{ rematchCount && !iVoted ? `(${rematchCount}/2)` : '' }}
      </button>
      <button @click="leaveRoom">回主页</button>
    </div>
    <div class="closehint" v-if="st.phase === 'over' && closeLeft">房间将在 {{ closeLeft }} 后自动解散,点"再来一局"继续保留</div>
    <div class="actions" v-else>
      <span class="hint">把房码或邀请链接发给对手,加入即开局</span>
    </div>

    <div v-if="st.phase === 'waiting'" class="overlay">
      <div class="card">
        <div class="big">{{ store.room }}</div>
        <p>把房码或链接发给对手,对方加入即开局</p>
        <div class="linkrow">
          <input readonly :value="link" @focus="($event.target as HTMLInputElement).select()" />
          <button @click="copyLink">复制链接</button>
        </div>
        <div class="linkrow">
          <input readonly :value="store.room" @focus="($event.target as HTMLInputElement).select()" />
          <button @click="copyCode">复制房码</button>
        </div>
        <div class="wait">等待对手加入…</div>
        <div class="ttl" v-if="closeLeft">房间将在 {{ closeLeft }} 后无人加入自动解散</div>
      </div>
    </div>
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
/* 对局区在视口剩余空间内垂直居中:顶部栏固定,棋盘整体下移 */
:deep(.board-wrap) {
  margin-top: auto;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
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
.state {
  margin: 2px 10px;
  padding: 8px 14px;
  border-radius: 999px;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  border: 1px solid #2a3346;
  background: #1d2432;
  color: #9aa5b8;
}
.state.myturn {
  background: #322a12;
  border-color: #6b5316;
  color: #e8c15a;
}
.state.danger {
  background: #341a1c;
  border-color: #5f3134;
  color: #ff9d94;
}
.state.notice {
  background: #14262f;
  border-color: #2b5566;
  color: #7cc7de;
}
.state.win {
  background: #16301f;
  border-color: #2c5a3a;
  color: #6fd598;
}
.state.lose {
  background: #341a1c;
  border-color: #5f3134;
  color: #e58a8a;
}
.state.draw {
  background: #322a12;
  border-color: #6b5316;
  color: #e8c15a;
}
.state.pulse {
  animation: pulse 1.6s ease-in-out infinite;
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
.warn {
  margin: 2px 10px 0;
  padding: 7px 12px;
  border: 1px solid #6b5316;
  background: #322a12;
  color: #e8c15a;
  border-radius: 10px;
  font-size: 13px;
  text-align: center;
  animation: pulse 1.6s ease-in-out infinite;
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
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 20, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.card {
  background: #1d2432;
  border: 1px solid #2a3346;
  border-radius: 16px;
  padding: 26px 30px;
  width: min(90vw, 400px);
  text-align: center;
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
  margin-top: 6px;
  color: #6b7280;
  font-size: 12px;
}
.closehint {
  margin: -6px 10px 0;
  padding: 0 12px 4px;
  color: #8a94a8;
  font-size: 12px;
  text-align: center;
}
@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}
</style>
