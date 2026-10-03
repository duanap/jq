import type { PieceType, Side } from '@jieqi/shared';

export const CHARS: Record<Side, Record<PieceType, string>> = {
  red: { K: '帥', A: '仕', B: '相', N: '馬', R: '車', C: '炮', P: '兵' },
  black: { K: '將', A: '士', B: '象', N: '馬', R: '車', C: '炮', P: '卒' },
};
