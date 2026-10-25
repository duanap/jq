import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { GameState, Side } from '@jieqi/shared';
import Board from '../src/components/Board.vue';
import { CHARS } from '../src/pieces';

function trayPieces(html: string, tray: string) {
  const content = html.split(new RegExp(`<div class="tray ${tray}"[^>]*>`))[1]!
    .split(/<div class="(?:tray|board)/)[0]!;
  return [...content.matchAll(/<div class="([^"]*\bmini\b[^"]*)"[^>]*>([\s\S]*?)<\/div>/g)].map(([, cls, body]) => ({
    cls: cls!.split(' ').filter((name) => name !== 'mini').join(' '),
    label: body!.match(/<span[^>]*>(.*?)<\/span>/)?.[1] ?? '',
    count: Number(body!.match(/<i[^>]*>(\d+)<\/i>/)?.[1] ?? 1),
  }));
}

describe('吃子托盘', () => {
  it.each<Side>(['red', 'black'])('%s 方能看清吃到的子,自己的暗子被吃后只显示背面', async (you) => {
    const opponent = you === 'red' ? 'black' : 'red';
    const state: GameState = {
      phase: 'waiting',
      seats: { red: null, black: null },
      cells: new Array(90).fill(null),
      turn: 'red',
      moveNum: 0,
      check: false,
      clocks: null,
      captured: {
        mine: [{ type: 'R' }, { type: 'N' }, { type: 'R' }],
        theirs: [{ type: 'C' }, { type: null }, { type: 'C' }, { type: null }, { type: 'P' }],
      },
      owner: 'red',
      rematch: { red: false, black: false },
    };
    const html = await renderToString(createSSRApp({ render: () => h(Board, { state, you }) }));

    // 横屏两侧和竖屏上下托盘都应显示正确的棋子、数量和遮罩。
    for (const tray of ['right', 'bottom']) {
      expect(trayPieces(html, tray)).toEqual([
        { cls: opponent, label: CHARS[opponent].R, count: 2 },
        { cls: opponent, label: CHARS[opponent].N, count: 1 },
      ]);
    }
    for (const tray of ['top', 'left']) {
      expect(trayPieces(html, tray)).toEqual([
        { cls: you, label: CHARS[you].C, count: 2 },
        { cls: 'masked', label: '', count: 2 },
        { cls: you, label: CHARS[you].P, count: 1 },
      ]);
    }
  });
});
