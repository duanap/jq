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

function styleOf(i: number) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  return { left: `${((50 + c * 100) / 9).toFixed(3)}%`, top: `${((50 + r * 100) / 10).toFixed(3)}%` };
}

function label(p: { side: Side; revealed: boolean; type?: string }): string {
  return p.revealed && p.type ? CHARS[p.side][p.type] : '揭';
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

/** 吃子托盘:同类合并计数,按被吃先后排列(先被吃在前)。左 = 黑方(屏幕上方)吃到的红子;右 = 红方吃到的黑子 */
const capturedGroups = computed(() => {
  const cap = props.state.captured ?? { red: [], black: [] };
  const group = (types: PieceType[]) => {
    const out: { type: PieceType; n: number }[] = [];
    for (const t of types) {
      const g = out.find((o) => o.type === t);
      if (g) g.n += 1;
      else out.push({ type: t, n: 1 });
    }
    return out;
  };
  return { left: group(cap.black), right: group(cap.red) };
});

/** 上一步的"起点→终点"箭头(viewBox 坐标,终点前缩避免整段压在棋子下) */
const arrow = computed(() => {
  const lm = props.state.lastMove;
  if (!lm) return null;
  const fr = Math.floor(lm.from / 9), fc = lm.from % 9;
  const tr = Math.floor(lm.to / 9), tc = lm.to % 9;
  const x1 = 50 + fc * 100, y1 = 50 + fr * 100;
  const x2 = 50 + tc * 100, y2 = 50 + tr * 100;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const trim = Math.min(38, len * 0.42);
  return { x1, y1, ex: x2 - (dx / len) * trim, ey: y2 - (dy / len) * trim };
});

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
    <div class="tray left">
      <div v-for="g in capturedGroups.left" :key="'bl' + g.type" class="mini red">
        <span>{{ CHARS.red[g.type] }}</span>
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
          :class="[p.side, { dark: !p.revealed, sel: selected === i, chk: i === kingInCheck, flip: flipping === i }]"
          :style="styleOf(i)"
          @pointerdown.stop.prevent="tap(i)"
        >
          <span>{{ label(p) }}</span>
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
    </div>

    <div class="tray right">
      <div v-for="g in capturedGroups.right" :key="'br' + g.type" class="mini black">
        <span>{{ CHARS.black[g.type] }}</span>
        <i v-if="g.n > 1">{{ g.n }}</i>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 8px;
}
/* 吃子托盘:贴棋盘两侧,与棋盘等高 */
.tray {
  width: 34px;
  max-height: calc(var(--bw) * 10 / 9);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  overflow: hidden;
  padding-top: 2px;
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
  background: radial-gradient(circle at 35% 30%, #fdf7e7, #f1e0b7 62%, #d8bf8a);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.mini.red {
  color: #b03024;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 0 0 1.5px rgba(176, 48, 36, 0.45);
}
.mini.black {
  color: #2f2a26;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 0 0 1.5px rgba(47, 42, 38, 0.45);
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
.board {
  --bw: min(calc(94vw - 90px), 56vh, 560px);
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
  background: radial-gradient(circle at 35% 30%, #fdf7e7, #f1e0b7 62%, #d8bf8a);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.35), inset 0 0 0 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
}
.piece.red {
  color: #b03024;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.35), inset 0 0 0 3px rgba(176, 48, 36, 0.4);
}
.piece.black {
  color: #2f2a26;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.35), inset 0 0 0 3px rgba(47, 42, 38, 0.4);
}
.piece.dark span {
  opacity: 0.38;
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
.arrow-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
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
</style>
