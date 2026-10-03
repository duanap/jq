import { describe, expect, it } from 'vitest';
import {
  attacksFrom, hasAnyLegalMove, inCheck, initialBoard, JieqiGame, kingsFacing,
  legalTargets, posTypeOf, pseudoMoves, publicView, shuffleBoard,
  type Board, type PieceType, type Side,
} from '../src';

const idx = (r: number, c: number) => r * 9 + c;
const empty = (): Board => new Array(90).fill(null);
const put = (b: Board, i: number, side: Side, trueType: PieceType, revealed = true) => {
  b[i] = { side, trueType, revealed };
};

describe('洗子', () => {
  it('帅/将明置原位,其余 15 子全暗', () => {
    const b = shuffleBoard();
    expect(b[idx(9, 4)]).toMatchObject({ side: 'red', trueType: 'K', revealed: true });
    expect(b[idx(0, 4)]).toMatchObject({ side: 'black', trueType: 'K', revealed: true });
    let darkRed = 0, darkBlack = 0;
    for (let i = 0; i < 90; i++) {
      const p = b[i]!;
      if (!p) continue;
      if (p.revealed) expect(p.trueType).toBe('K');
      else if (p.side === 'red') darkRed++;
      else darkBlack++;
    }
    expect(darkRed).toBe(15);
    expect(darkBlack).toBe(15);
  });

  it('暗子的兵种多重集合固定:车马炮士象各2、兵5', () => {
    for (let round = 0; round < 5; round++) {
      const b = shuffleBoard();
      for (const side of ['red', 'black'] as Side[]) {
        const cnt: Record<string, number> = {};
        for (let i = 0; i < 90; i++) {
          const p = b[i]!;
          if (p && !p.revealed && p.side === side) cnt[p.trueType] = (cnt[p.trueType] ?? 0) + 1;
        }
        expect(cnt).toEqual({ R: 2, N: 2, B: 2, A: 2, C: 2, P: 5 });
      }
    }
  });

  it('暗子只占本方初始位,且位置身份非帅', () => {
    const b = shuffleBoard();
    for (let i = 0; i < 90; i++) {
      const p = b[i]!;
      if (p && !p.revealed) {
        if (p.side === 'red') expect(i).toBeGreaterThanOrEqual(45);
        else expect(i).toBeLessThan(45);
        expect(posTypeOf(i)).not.toBe('K');
      }
    }
  });

  it('两次洗子结果不同(概率性,失败率可忽略)', () => {
    const a = shuffleBoard().map((p) => (p && !p.revealed ? p.trueType : null));
    const b = shuffleBoard().map((p) => (p && !p.revealed ? p.trueType : null));
    expect(a).not.toEqual(b);
  });
});

describe('走法生成', () => {
  it('车:直行至挡子,可吃敌子', () => {
    const b = initialBoard();
    expect(pseudoMoves(b, idx(0, 0))).toEqual([9, 18]); // (3,0) 自家卒挡住
    const b2 = empty();
    put(b2, idx(0, 0), 'black', 'R');
    put(b2, idx(5, 0), 'red', 'P');
    // 竖线直至吃 (5,0);横线一路通到底
    expect(pseudoMoves(b2, idx(0, 0))).toEqual([9, 18, 27, 36, 45, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('马:走日,蹩腿', () => {
    const b = initialBoard();
    expect(pseudoMoves(b, idx(0, 1))).toEqual([idx(2, 0), idx(2, 2)]);
  });

  it('炮:平移走空格,隔一子吃', () => {
    const b = initialBoard();
    const m = pseudoMoves(b, idx(2, 1));
    expect(m).toContain(idx(9, 1)); // 隔 (7,1) 自家炮吃 (9,1) 红马
    expect(m).not.toContain(idx(2, 7));
    expect(m).not.toContain(idx(0, 1));
    expect(m).toHaveLength(12);
  });

  it('暗士只走宫内,明士全盘斜走', () => {
    const b = empty();
    put(b, idx(9, 3), 'red', 'R', false); // 士位暗子
    expect(pseudoMoves(b, idx(9, 3))).toEqual([idx(8, 4)]);
    b[idx(9, 3)] = { side: 'red', trueType: 'A', revealed: true };
    const m = pseudoMoves(b, idx(9, 3));
    expect(m).toContain(idx(8, 2)); // 出宫
    expect(m).toContain(idx(8, 4));
  });

  it('明象可以过河,塞象眼照算', () => {
    const b = empty();
    put(b, idx(6, 2), 'red', 'B', true);
    const m = pseudoMoves(b, idx(6, 2));
    expect(m).toEqual(expect.arrayContaining([idx(4, 0), idx(4, 4), idx(8, 0), idx(8, 4)]));
    put(b, idx(5, 3), 'black', 'P', true); // 塞 (4,4) 的眼 (5,3)
    expect(pseudoMoves(b, idx(6, 2))).not.toContain(idx(4, 4));
  });

  it('兵:过河前只进,过河后可横', () => {
    const b = empty();
    put(b, idx(4, 4), 'red', 'P', true);
    expect(pseudoMoves(b, idx(4, 4)).sort()).toEqual([idx(3, 4), idx(4, 3), idx(4, 5)]);
    put(b, idx(6, 0), 'red', 'P', true);
    expect(pseudoMoves(b, idx(6, 0))).toEqual([idx(5, 0)]);
    put(b, idx(3, 4), 'black', 'P', true);
    expect(pseudoMoves(b, idx(3, 4))).toEqual([idx(4, 4)]);
  });
});

describe('将军与合法走法', () => {
  it('白脸将:两帅照面', () => {
    const b = empty();
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(0, 4), 'black', 'K');
    expect(kingsFacing(b)).toBe(true);
    put(b, idx(4, 4), 'red', 'P');
    expect(kingsFacing(b)).toBe(false);
  });

  it('暗子按位置身份攻击(车位暗子直线攻击)', () => {
    const b = empty();
    put(b, idx(9, 8), 'red', 'P', false); // 车位暗子
    expect(attacksFrom(b, idx(9, 8))).toContain(idx(0, 8));
  });

  it('兵位暗子不越权攻击', () => {
    const b = empty();
    put(b, idx(0, 4), 'black', 'K');
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(6, 0), 'red', 'R', false); // 兵位暗子,只攻 (5,0)
    expect(inCheck(b, 'black')).toBe(false);
  });

  it('被将军时,不解将的走法全被过滤', () => {
    const b = empty();
    put(b, idx(0, 4), 'black', 'K');
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(4, 4), 'red', 'R'); // 车 40 直照黑帅
    put(b, idx(0, 0), 'black', 'R'); // 黑车沿第一横线解不了将
    expect(legalTargets(b, 'black', idx(0, 0))).toEqual([]);
    put(b, idx(2, 0), 'black', 'C'); // 黑炮可平 (2,4) 垫将
    expect(legalTargets(b, 'black', idx(2, 0))).toContain(idx(2, 4));
  });

  it('不允许吃将', () => {
    const b = empty();
    put(b, idx(0, 4), 'black', 'K');
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(0, 3), 'red', 'R');
    expect(legalTargets(b, 'red', idx(0, 3))).not.toContain(idx(0, 4));
  });

  it('困毙:无子可动且未被将', () => {
    const b = empty();
    put(b, idx(0, 4), 'black', 'K');
    put(b, idx(9, 4), 'red', 'K');
    // 红明士占 (0,3)(0,5)(1,4),互相保护,堵死并看住相邻格
    put(b, idx(0, 3), 'red', 'A', true);
    put(b, idx(0, 5), 'red', 'A', true);
    put(b, idx(1, 4), 'red', 'A', true);
    // 红车封 (1,3)(1,5) 与第二排
    put(b, idx(2, 3), 'red', 'R', true);
    put(b, idx(1, 8), 'red', 'R', true);
    expect(inCheck(b, 'black')).toBe(false);
    expect(hasAnyLegalMove(b, 'black')).toBe(false);
  });

  it('绝杀:被将且无解', () => {
    const b = empty();
    put(b, idx(0, 4), 'black', 'K');
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(0, 5), 'black', 'P');
    put(b, idx(1, 4), 'black', 'P');
    put(b, idx(0, 0), 'red', 'R'); // 照第一横线
    put(b, idx(1, 0), 'red', 'R'); // 封 (1,3)
    put(b, idx(1, 8), 'red', 'R'); // 封 (1,5)
    put(b, idx(2, 2), 'red', 'R'); // 封 (2,3)(2,4)(2,5)
    expect(inCheck(b, 'black')).toBe(true);
    expect(hasAnyLegalMove(b, 'black')).toBe(false);
  });
});

describe('对局引擎', () => {
  it('初始局面红车位暗子只能直进两格(被自家兵挡)', () => {
    const g = new JieqiGame();
    expect(g.legalTargets(idx(9, 0))).toEqual([idx(8, 0), idx(7, 0)]);
  });

  it('动暗子即揭示,翻出什么算什么', () => {
    const g = new JieqiGame();
    const mv = g.applyMove(idx(9, 0), idx(8, 0))!;
    expect(mv.reveal).toBeDefined();
    expect(mv.by).toBe('red');
    expect(g.turn).toBe('black');
    const p = g.board[idx(8, 0)]!;
    expect(p.revealed).toBe(true);
    expect(p.trueType).toBe(mv.reveal);
    expect(g.noCapturePlies).toBe(1);
    expect(mv.check).toBe(false);
  });

  it('黑方先行被拒绝', () => {
    const g = new JieqiGame();
    expect(g.applyMove(idx(0, 0), idx(9, 0))).toBeNull();
  });

  it('吃子返回被吃身份;吃暗子 = 当场翻明', () => {
    const b = empty();
    put(b, idx(0, 4), 'black', 'K');
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(3, 4), 'black', 'P', false); // 黑方暗兵(兵位初始格)
    put(b, idx(5, 4), 'red', 'R');          // 红车
    const g = new JieqiGame(b);
    const mv = g.applyMove(idx(5, 4), idx(3, 4))!;
    expect(mv.capture).toBe(true);
    expect(mv.capturedType).toBe('P'); // 暗子被吃即翻明
    expect(g.board[idx(3, 4)]!.trueType).toBe('R');
  });

  it('三次重复局面判和', () => {
    const b = empty();
    put(b, idx(0, 4), 'black', 'K');
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(4, 0), 'red', 'R');
    put(b, idx(9, 6), 'red', 'P'); // 挡黑车对红帅的横线攻击
    put(b, idx(9, 8), 'black', 'R');
    put(b, idx(2, 4), 'black', 'P'); // 挡白脸将
    const g = new JieqiGame(b);
    const seq: [number, number][] = [
      [idx(4, 0), idx(4, 1)], [idx(9, 8), idx(8, 8)],
      [idx(4, 1), idx(4, 0)], [idx(8, 8), idx(9, 8)],
      [idx(4, 0), idx(4, 1)], [idx(9, 8), idx(8, 8)],
      [idx(4, 1), idx(4, 0)], [idx(8, 8), idx(9, 8)],
    ];
    for (const [f, t] of seq) expect(g.applyMove(f, t)).not.toBeNull();
    expect(g.status).toBe('over');
    expect(g.result).toEqual({ reason: 'repetition', winner: null });
  });

  it('长将判负:单车反复照将,黑帅来回躲', () => {
    const b = empty();
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(1, 3), 'black', 'K'); // 黑帅 (1,3)
    put(b, idx(0, 0), 'red', 'R');   // 红车 (0,0)
    const g = new JieqiGame(b);
    const seq: [number, number][] = [
      [idx(0, 0), idx(1, 0)], // C(1,0) 沿第一排照 (1,3)
      [idx(1, 3), idx(0, 3)], // 帅躲 (0,3)
      [idx(1, 0), idx(0, 0)], // C(0,0) 照 (0,3)
      [idx(0, 3), idx(1, 3)],
      [idx(0, 0), idx(1, 0)],
      [idx(1, 3), idx(0, 3)],
      [idx(1, 0), idx(0, 0)],
      [idx(0, 3), idx(1, 3)],
    ];
    for (const [f, t] of seq) expect(g.applyMove(f, t)).not.toBeNull();
    expect(g.status).toBe('over');
    expect(g.result).toEqual({ reason: 'perpetual', winner: 'black' });
  });

  it('无吃子到达阈值判和', () => {
    const b = empty();
    put(b, idx(0, 4), 'black', 'K');
    put(b, idx(9, 4), 'red', 'K');
    put(b, idx(2, 4), 'black', 'P'); // 挡白脸将
    put(b, idx(5, 0), 'red', 'R');
    const g = new JieqiGame(b);
    g.noCapturePlies = 119;
    const mv = g.applyMove(idx(5, 0), idx(4, 0))!;
    expect(mv.result).toEqual({ reason: 'no_capture', winner: null });
    expect(g.status).toBe('over');
  });

  it('publicView:暗子绝不带身份字段', () => {
    const v = publicView(shuffleBoard());
    for (const c of v) {
      if (!c) continue;
      if (!c.revealed) expect('type' in c).toBe(false);
    }
  });
});
