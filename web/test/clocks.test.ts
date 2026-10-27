import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, ref } from 'vue';
import type { GameState } from '@jieqi/shared';
import { useClocks } from '../src/clocks';

// 只挂载组合式函数的生命周期,无需浏览器 DOM。
const renderer = createRenderer<object, object>({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert: () => {}, remove: () => {}, setText: () => {}, setElementText: () => {},
  parentNode: () => null, nextSibling: () => null, patchProp: () => {},
});
let app: ReturnType<typeof renderer.createApp>;

function mountClocks() {
  const state = ref<GameState | null>({
    phase: 'playing', seats: { red: null, black: null }, cells: [], turn: 'red',
    moveNum: 1, check: false, clocks: { red: 60_000, black: 50_000 },
    captured: { mine: [], theirs: [] }, owner: 'red', rematch: { red: false, black: false },
  });
  let clocks!: ReturnType<typeof useClocks>;
  app = renderer.createApp({ setup() { clocks = useClocks(state); return () => null; } });
  app.mount({});
  return { state, clocks };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }));
afterEach(() => { app?.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('对弈倒计时', () => {
  it('没有新消息也持续倒数,仅递减行棋方,不修改服务端快照', () => {
    const { state, clocks } = mountClocks();
    vi.advanceTimersByTime(3200);
    expect(clocks.value).toEqual({ red: 56_800, black: 50_000 });
    expect(state.value!.clocks).toEqual({ red: 60_000, black: 50_000 });
  });

  it('走子与加秒后按新快照校准,切换到另一方倒数', () => {
    const { state, clocks } = mountClocks();
    vi.advanceTimersByTime(2000);
    state.value = { ...state.value!, turn: 'black', clocks: { red: 61_000, black: 50_000 } };
    vi.advanceTimersByTime(1400);
    expect(clocks.value).toEqual({ red: 61_000, black: 48_600 });
  });

  it('重连同一回合也重新校准,不重复扣除断线时间', () => {
    const { state, clocks } = mountClocks();
    vi.advanceTimersByTime(5000);
    state.value = { ...state.value!, clocks: { red: 52_000, black: 50_000 } };
    expect(clocks.value!.red).toBe(52_000);
    vi.advanceTimersByTime(1000);
    expect(clocks.value!.red).toBe(51_000);
  });

  it('后台定时器延迟后按真实经过时长追上,归零后不变为负数', () => {
    const { clocks } = mountClocks();
    vi.spyOn(performance, 'now').mockReturnValue(120_000);
    vi.advanceTimersByTime(200);
    expect(clocks.value).toEqual({ red: 0, black: 50_000 });
  });

  it.each(['waiting', 'over'] as const)('%s 阶段保持服务端显示时间', (phase) => {
    const { state, clocks } = mountClocks();
    state.value = { ...state.value!, phase };
    vi.advanceTimersByTime(3000);
    expect(clocks.value).toEqual({ red: 60_000, black: 50_000 });
  });

  it('不限时或退出房间时不显示倒计时,卸载清理定时器', () => {
    const { state, clocks } = mountClocks();
    state.value = { ...state.value!, clocks: null };
    vi.advanceTimersByTime(1000);
    expect(clocks.value).toBeNull();
    state.value = null;
    expect(clocks.value).toBeNull();
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
