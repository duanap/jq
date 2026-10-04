<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { boardFromView, legalTargets } from '@jieqi/shared';
import type { GameState, PieceType, Side } from '@jieqi/shared';
import { CHARS } from '../pieces';

const props = defineProps<{ state: GameState; you: Side | null }>();
const emit = defineEmits<{ (e: 'move', from: number, to: number): void }>();

const board = computed(() => boardFromView(props.state.cells));
const selected = ref<number | null>(null);
const targets = ref<number[]>([]);
const flipping = ref<number | null>(null);

watch(
  () => props.state.reveal,
  (rv) => {
    if (!rv) return;
    flipping.value = rv.pos;
    setTimeout(() => {
      if (flipping.value === rv.pos) flipping.value = null;
    }, 650);
  },
);

const myTurn = computed(
  () => props.state.phase === 'playing' && props.you !== null && props.state.turn === props.you,
);

function tap(i: number) {
  if (!myTurn.value) return;
  const p = board.value[i];
  if (p && p.side === props.you) {
    if (selected.value === i) {
      selected.value = null;
      targets.value = [];
    } else {
      selected.value = i;
      targets.value = legalTargets(board.value, props.you!, i);
    }
    return;
  }
  if (selected.value !== null && targets.value.includes(i)) {
    emit('move', selected.value, i);
    selected.value = null;
    targets.value = [];
  } else {
    selected.value = null;
    targets.value = [];
  }
}

/** 视角:黑方玩家棋盘旋转 180°,自己的子永远在下方 */
const flip = computed(() => props.you === 'black');

function styleOf(i: number) {
  const v = flip.value ? 89 - i : i;
  const r = Math.floor(v / 9);
  const c = v % 9;
  return { left: `${((50 + c * 100) / 9).toFixed(3)}%`, top: `${((50 + r * 100) / 10).toFixed(3)}%` };
}

function label(p: { side: Side; revealed: boolean; type?: string }): string {
  return p.revealed && p.type ? CHARS[p.side][p.type] : '';
}

// ---------- 楚河横幅(3 秒自动消失)与将军/绝杀特效 ----------
const banner = ref<{ text: string; tone: string } | null>(null);
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
function showBanner(text: string, tone = 'turn', ms = 3000) {
  banner.value = { text, tone };
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (banner.value = null), ms);
}

const fx = ref<string | null>(null);
let fxTimer: ReturnType<typeof setTimeout> | null = null;
function showFx(text: string, ms = 1900) {
  fx.value = text;
  if (fxTimer) clearTimeout(fxTimer);
  fxTimer = setTimeout(() => (fx.value = null), ms);
}

watch(
  () => props.state.turn,
  () => {
    if (props.state.phase === 'playing' && props.state.turn === props.you) {
      showBanner(props.state.check ? '轮到你 · 将军!' : '轮到你走子');
    }
  },
);
watch(
  () => props.state.check,
  (c, was) => {
    if (c && !was && props.state.phase === 'playing') showFx('将军!');
  },
);
const mateFxDone = ref(false);
watch(
  () => props.state.result,
  (r) => {
    if (r?.reason === 'mate' && !mateFxDone.value) {
      mateFxDone.value = true;
      showFx('绝杀!', 2300);
    }
  },
);

// ---------- 开局摆子动画 ----------
const dealing = ref(false);
watch(
  () => [props.state.phase, props.state.moveNum] as const,
  ([phase, moveNum]) => {
    if (phase === 'playing' && moveNum === 0) {
      dealing.value = true;
      setTimeout(() => (dealing.value = false), 1500);
    }
  },
  { immediate: true },
);
function dealDelay(i: number) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const dr = flip.value ? 9 - r : r;
  const dc = flip.value ? 8 - c : c;
  return `${Math.min(1100, (9 - dr) * 80 + dc * 25)}ms`;
}

const kingInCheck = computed(() => {
  if (!props.state.check) return -1;
  const cells = props.state.cells;
  for (let i = 0; i < 90; i++) {
    const c = cells[i];
    if (c?.revealed && c.type === 'K' && c.side === props.state.turn) return i;
  }
  return -1;
});

const last = computed(() => props.state.lastMove);

/** 上一步的"起点→终点"箭头(viewBox 坐标;黑方视角整体旋转 180°,终点前缩) */
const arrow = computed(() => {
  const lm = props.state.lastMove;
  if (!lm) return null;
  const fr = Math.floor(lm.from / 9), fc = lm.from % 9;
  const tr = Math.floor(lm.to / 9), tc = lm.to % 9;
  let x1 = 50 + fc * 100, y1 = 50 + fr * 100;
  let x2 = 50 + tc * 100, y2 = 50 + tr * 100;
  if (flip.value) {
    x1 = 900 - x1; y1 = 1000 - y1;
    x2 = 900 - x2; y2 = 1000 - y2;
  }
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const trim = Math.min(38, len * 0.42);
  return { x1, y1, ex: x2 - (dx / len) * trim, ey: y2 - (dy / len) * trim };
});

/** 吃子托盘:同类合并计数,按被吃先后排列(先被吃在前)。
 *  屏幕上方/左侧 = 对方吃到的我的子(其中暗子被吃对我保密,只显示遮罩背面);
 *  下方/右侧 = 我吃到的对方的子(可见真实身份) */
const capturedGroups = computed(() => {
  const cap = props.state.captured ?? { mine: [], theirs: [] };
  const group = (types: (PieceType | null)[]) => {
    const out: { type: PieceType | null; n: number }[] = [];
    for (const t of types) {
      const g = out.find((o) => o.type === t);
      if (g) g.n += 1;
      else out.push({ type: t, n: 1 });
    }
    return out;
  };
  return { opp: group(cap.theirs), mine: group(cap.mine) };
});
const mySide = computed<Side>(() => (props.you === 'black' ? 'black' : 'red'));
const oppSide = computed<Side>(() => (props.you === 'black' ? 'red' : 'black'));

const LINES: [number, number, number, number][] = (() => {
  const L: [number, number, number, number][] = [];
  for (let r = 0; r < 10; r++) L.push([50, 50 + r * 100, 850, 50 + r * 100]);
  for (let c = 0; c < 9; c++) {
    if (c === 0 || c === 8) L.push([50 + c * 100, 50, 50 + c * 100, 950]);
    else {
      L.push([50 + c * 100, 50, 50 + c * 100, 450]);
      L.push([50 + c * 100, 550, 50 + c * 100, 950]);
    }
  }
  L.push([350, 50, 550, 250], [550, 50, 350, 250], [350, 750, 550, 950], [550, 750, 350, 950]);
  return L;
})();
</script>

<template>
  <div class="board-wrap">
    <div class="tray top">
      <div v-for="(g, gi) in capturedGroups.opp" :key="'bt' + gi" class="mini" :class="g.type ? mySide : 'masked'">
        <span v-if="g.type">{{ CHARS[mySide][g.type] }}</span>
        <i v-if="g.n > 1">{{ g.n }}</i>
      </div>
    </div>
    <div class="tray left">
      <div v-for="(g, gi) in capturedGroups.opp" :key="'bl' + gi" class="mini" :class="g.type ? mySide : 'masked'">
        <span v-if="g.type">{{ CHARS[mySide][g.type] }}</span>
        <i v-if="g.n > 1">{{ g.n }}</i>
      </div>
    </div>

    <div class="board" :class="{ myturn: myTurn }">
      <svg viewBox="0 0 900 1000" class="grid">
        <rect x="38" y="38" width="824" height="924" fill="none" stroke="#7a4a1f" stroke-width="5" />
        <line
          v-for="(l, i) in LINES"
          :key="i"
          :x1="l[0]"
          :y1="l[1]"
          :x2="l[2]"
          :y2="l[3]"
          stroke="#7a4a1f"
          stroke-width="2.5"
        />
        <text x="235" y="516" class="river">楚 河</text>
        <text x="665" y="516" class="river">汉 界</text>
      </svg>

      <template v-for="i in 90" :key="'m' + i">
        <div v-if="last && i - 1 === last.from" class="mark from" :style="styleOf(i - 1)"></div>
        <div v-if="last && i - 1 === last.to" class="mark to" :style="styleOf(i - 1)"></div>
      </template>

      <template v-for="(p, i) in state.cells" :key="'p' + i">
        <div
          v-if="p"
          class="piece"
          :class="[p.side, { dark: !p.revealed, sel: selected === i, chk: i === kingInCheck, flip: flipping === i, deal: dealing }]"
          :style="dealing ? { ...styleOf(i), animationDelay: dealDelay(i) } : styleOf(i)"
          @pointerdown.stop.prevent="tap(i)"
        >
          <span v-if="p.revealed">{{ label(p) }}</span>
        </div>
      </template>

      <div
        v-for="t in targets"
        :key="'t' + t"
        class="dot"
        :class="{ cap: !!state.cells[t] }"
        :style="styleOf(t)"
        @pointerdown.stop.prevent="tap(t)"
      ></div>

      <svg v-if="arrow" class="arrow-layer" viewBox="0 0 900 1000">
        <defs>
          <marker id="jq-arrow-head" markerWidth="4.5" markerHeight="4.5" refX="2.8" refY="2.25" orient="auto">
            <path d="M0,0 L4.5,2.25 L0,4.5 Z" fill="rgba(200, 55, 25, 0.85)" />
          </marker>
        </defs>
        <line
          :x1="arrow.x1"
          :y1="arrow.y1"
          :x2="arrow.ex"
          :y2="arrow.ey"
          stroke="rgba(200, 55, 25, 0.8)"
          stroke-width="11"
          stroke-linecap="round"
          marker-end="url(#jq-arrow-head)"
        />
      </svg>

      <div v-if="banner" class="river-banner" :class="banner.tone">{{ banner.text }}</div>
      <div v-if="fx" class="fx"><span>{{ fx }}</span></div>
    </div>

    <div class="tray right">
      <div v-for="(g, gi) in capturedGroups.mine" :key="'br' + gi" class="mini" :class="oppSide">
        <span v-if="g.type">{{ CHARS[oppSide][g.type] }}</span>
        <i v-if="g.n > 1">{{ g.n }}</i>
      </div>
    </div>
    <div class="tray bottom">
      <div v-for="(g, gi) in capturedGroups.mine" :key="'bb' + gi" class="mini" :class="oppSide">
        <span v-if="g.type">{{ CHARS[oppSide][g.type] }}</span>
        <i v-if="g.n > 1">{{ g.n }}</i>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-wrap {
  --bw: min(94vw, 56vh, 560px);
  display: grid;
  gap: 6px;
  justify-content: center;
  align-items: center;
  grid-template-areas: 'top' 'board' 'bottom';
  grid-template-columns: min-content;
  padding: 4px 8px;
}
.tray.top { grid-area: top; }
.tray.bottom { grid-area: bottom; }
.tray.left, .tray.right { display: none; }
.tray {
  display: flex;
  gap: 3px;
  overflow: hidden;
}
.tray.top, .tray.bottom {
  flex-direction: row;
  max-width: var(--bw);
  min-height: 30px;
}
/* PC/横屏:托盘放两侧,棋盘更大 */
@media (orientation: landscape) {
  .board-wrap {
    --bw: min(calc(100vw - 250px), calc((100vh - 215px) * 0.9), 640px);
    grid-template-areas: 'left board right';
    grid-template-columns: min-content min-content min-content;
  }
  .tray.top, .tray.bottom { display: none; }
  .tray.left, .tray.right {
    display: flex;
    flex-direction: column;
    max-height: calc(var(--bw) * 10 / 9);
    min-width: 30px;
  }
  .tray.left { grid-area: left; }
  .tray.right { grid-area: right; }
}
.board {
  grid-area: board;
  position: relative;
  width: var(--bw);
  aspect-ratio: 9 / 10;
  background: linear-gradient(160deg, #f3dcae, #e9c68c 70%, #dfb877);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  transition: box-shadow 0.25s;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}
.board.myturn {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45), 0 0 0 2px rgba(217, 165, 20, 0.55);
}
.board:not(.myturn) .piece {
  cursor: default;
}
.grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.river {
  font-size: 46px;
  fill: rgba(122, 74, 31, 0.5);
  text-anchor: middle;
  font-family: 'KaiTi', 'STKaiti', serif;
  letter-spacing: 18px;
}
.piece {
  position: absolute;
  width: calc(var(--bw) / 9 * 0.86);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'KaiTi', 'STKaiti', 'Noto Serif SC', serif;
  font-size: calc(var(--bw) / 9 * 0.52);
  font-weight: 700;
  line-height: 1;
  color: #333;
  background: radial-gradient(circle at 32% 26%, #fef9ec 0%, #f6e7c3 40%, #e6cd97 72%, #c9a55e 100%);
  box-shadow:
    0 4px 9px rgba(0, 0, 0, 0.42),
    0 1px 2px rgba(0, 0, 0, 0.3),
    inset 0 2px 2px rgba(255, 255, 255, 0.7),
    inset 0 -3px 6px rgba(133, 94, 40, 0.5);
  cursor: pointer;
}
.piece::before {
  content: '';
  position: absolute;
  inset: 8%;
  border-radius: 50%;
  border: 1px solid currentColor;
  opacity: 0.6;
  pointer-events: none;
}
.piece.red {
  color: #a5271c;
}
.piece.black {
  color: #26211d;
}
.piece span {
  position: relative;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.65);
}
/* 未揭开的棋子:木质背面,无文字无标记 */
.piece.dark {
  background: radial-gradient(circle at 32% 26%, #eeddb2 0%, #dcc28c 45%, #c6a569 75%, #ab8a4e 100%);
  cursor: pointer;
}
.piece.dark::before {
  opacity: 0.28;
}
.piece.sel {
  outline: 3px solid #d9a514;
  outline-offset: 2px;
}
.piece.chk {
  animation: chk 1s ease-in-out infinite;
}
@keyframes chk {
  50% {
    box-shadow: 0 0 0 6px rgba(220, 40, 40, 0.55);
  }
}
.piece.flip {
  animation: flipin 0.55s ease;
}
@keyframes flipin {
  0% {
    transform: translate(-50%, -50%) rotateY(90deg) scale(1.15);
    filter: brightness(0.7);
  }
  100% {
    transform: translate(-50%, -50%) rotateY(0);
  }
}
.piece.deal {
  animation: dealin 0.45s ease both;
}
@keyframes dealin {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) translateY(-14px) scale(0.6);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) translateY(0) scale(1);
  }
}
.mark {
  position: absolute;
  width: calc(var(--bw) / 9 * 0.92);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.mark.from {
  background: rgba(200, 90, 30, 0.3);
  border: 2px dashed rgba(170, 70, 20, 0.6);
  border-radius: 10px;
}
.mark.to {
  background: rgba(255, 205, 70, 0.4);
  border: 3px solid rgba(214, 98, 20, 0.9);
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(230, 120, 20, 0.65);
}
.dot {
  position: absolute;
  width: calc(var(--bw) / 9 * 0.32);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: rgba(60, 120, 60, 0.45);
  cursor: pointer;
}
.dot.cap {
  width: calc(var(--bw) / 9 * 0.8);
  background: transparent;
  border: 4px solid rgba(200, 60, 40, 0.75);
}
.arrow-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.mini {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  font-family: 'KaiTi', 'STKaiti', 'Noto Serif SC', serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  background: radial-gradient(circle at 32% 26%, #fef9ec, #f1e0b7 55%, #cfae72 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.mini.red {
  color: #a5271c;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 0 0 1.5px rgba(165, 39, 28, 0.45);
}
.mini.black {
  color: #26211d;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 0 0 1.5px rgba(38, 33, 29, 0.45);
}
.mini i {
  position: absolute;
  top: -5px;
  right: -7px;
  background: #d6451e;
  color: #fff;
  font-style: normal;
  font-size: 10px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 8px;
  font-family: system-ui, sans-serif;
}
/* 被对方吃掉的暗子:对我保密,仅显示带遮罩的背面 */
.mini.masked {
  background: radial-gradient(circle at 32% 26%, #eeddb2 0%, #dcc28c 45%, #c6a569 75%, #ab8a4e 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.mini.masked::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: rgba(30, 25, 15, 0.42);
  border: 1px solid rgba(90, 60, 20, 0.4);
}
.river-banner {
  position: absolute;
  left: 50%;
  top: 41%;
  transform: translate(-50%, -50%);
  z-index: 15;
  padding: 8px 26px;
  border-radius: 999px;
  background: rgba(30, 25, 15, 0.78);
  color: #ffd97a;
  font-size: calc(var(--bw) * 0.052);
  font-weight: 700;
  letter-spacing: 2px;
  border: 1px solid rgba(255, 217, 122, 0.5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  white-space: nowrap;
  animation: banner-in 0.3s ease;
}
.river-banner.danger {
  color: #ff9d94;
  border-color: rgba(255, 120, 110, 0.6);
}
@keyframes banner-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) translateY(-8px);
  }
}
.fx {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 20;
}
.fx span {
  font-family: 'KaiTi', 'STKaiti', serif;
  font-size: calc(var(--bw) * 0.17);
  font-weight: 900;
  letter-spacing: 8px;
  color: #d82a1e;
  text-shadow:
    0 0 18px rgba(255, 215, 0, 0.9),
    0 2px 0 rgba(120, 0, 0, 0.55),
    0 0 2px #fff;
  -webkit-text-stroke: 1px rgba(255, 235, 180, 0.85);
  animation: fx-pop 1.9s ease-out forwards;
}
@keyframes fx-pop {
  0% {
    transform: scale(2.6);
    opacity: 0;
  }
  18% {
    transform: scale(1);
    opacity: 1;
  }
  70% {
    transform: scale(1.05);
    opacity: 1;
  }
  100% {
    transform: scale(1.08);
    opacity: 0;
  }
}
</style>
