import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import type { GameState } from '@jieqi/shared';

/** 服务端快照为基准,仅在本地递减行棋方的显示时间,不参与超时判定。 */
export function useClocks(state: Ref<GameState | null>) {
  const now = ref(performance.now());
  let receivedAt = now.value;
  let timer: ReturnType<typeof setInterval> | undefined;

  watch(state, () => {
    receivedAt = performance.now();
    now.value = receivedAt;
  }, { flush: 'sync' });

  onMounted(() => {
    timer = setInterval(() => { now.value = performance.now(); }, 200);
  });
  onUnmounted(() => clearInterval(timer));

  return computed(() => {
    const s = state.value;
    if (!s?.clocks) return null;
    if (s.phase !== 'playing') return { ...s.clocks };
    const elapsed = Math.max(0, now.value - receivedAt);
    return { ...s.clocks, [s.turn]: Math.max(0, s.clocks[s.turn] - elapsed) };
  });
}
