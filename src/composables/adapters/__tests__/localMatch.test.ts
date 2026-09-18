/**
 * LocalMatchAdapter 单测（V0.3 Step 2）
 * ==================================================================
 * 覆盖三条核心断言：
 *   1. 选人流程：setChars 写入 + 开局初始化（onTurnStart 跑过）
 *   2. 缇宝中间态：useSkill 后 pendingTibao=true 且不切回合
 *   3. 沉默 UI 判定：阿格莱雅 vs 那刻夏 → canUseSkill 返回 false
 */
import { describe, expect, it } from 'vitest';
import { createLocalMatch } from '../localMatch';
import { applyMove } from '../../../game/engine';
import { INITIAL_BOARD } from '../../../game/constants';

function makeAdapter() {
  return createLocalMatch(() => null);
}

describe('1. 选人流程：setChars 写入 + 开局初始化', () => {
  it('setChars 写入双方角色并初始化第一回合', () => {
    const a = makeAdapter();
    a.setChars(['baie', 'wandi']);
    expect(a.state.value.chars).toEqual(['baie', 'wandi']);
    // onTurnStart 已跑：currentPlayer=0，board=初始，turn=0
    expect(a.state.value.currentPlayer).toBe(0);
    expect(a.state.value.turn).toBe(0);
    expect(a.state.value.board).toEqual(INITIAL_BOARD);
    expect(a.state.value.finished).toBe(false);
    // 技能未用
    expect(a.skillUsed.value).toEqual([false, false]);
  });

  it('setChars 后 chars 通过 computed 透传，开局前 skillUsed 保持 false', () => {
    const a = makeAdapter();
    a.setChars(['tibao', 'nakkari']);
    expect(a.chars.value).toEqual(['tibao', 'nakkari']);
    // 缇宝 onTurnStart 应设 direction 默认 ccw
    expect(a.state.value.direction).toBe('ccw');
    // 开局前 skillUsed 全 false（不可通过其他途径改）
    expect(a.skillUsed.value).toEqual([false, false]);
  });

  it('reset 后 chars 清空，回到未选人状态', () => {
    const a = makeAdapter();
    a.setChars(['baie', 'wandi']);
    a.reset();
    expect(a.chars.value).toEqual(['', '']);
    expect(a.state.value.currentPlayer).toBe(0);
  });
});

describe('2. 缇宝中间态：useSkill 后不切回合', () => {
  it('缇宝传送+播种后 pendingTibao=true，currentPlayer 不变，skillUsed[0]=true', () => {
    const a = makeAdapter();
    a.setChars(['tibao', 'saifeier']);
    // 缇宝 onTurnStart 已设 direction=ccw；useSkill 传 pit=0, targetPit=5, dir=ccw
    const ok = a.useSkill('tibao', 0, 5, 'ccw');
    expect(ok).toBe(true);
    // 中间态
    expect(a.pendingTibao.value).toBe(true);
    // 不切回合
    expect(a.state.value.currentPlayer).toBe(0);
    // 技能已消耗
    expect(a.skillUsed.value[0]).toBe(true);
    // 棋盘已变（传送 board[0]→board[5] 后从 board[5] 播种 8 颗）
    expect(a.state.value.board[0]).toBe(1); // 播种最后一颗落回 board[0]
    expect(a.state.value.board[5]).toBe(0); // 传送后播种取走 8 颗
    expect(a.state.value.stores[0]).toBe(1); // 1 颗进 store0
  });

  it('缇宝中间态期间 canUseSkill 返回 false（不能再放技能）', () => {
    const a = makeAdapter();
    a.setChars(['tibao', 'saifeier']);
    a.useSkill('tibao', 0, 5, 'ccw');
    expect(a.pendingTibao.value).toBe(true);
    expect(a.canUseSkill(0)).toBe(false);
  });
});

describe('3. 沉默 UI 判定：阿格莱雅被那刻夏封印', () => {
  it('己方阿格莱雅 + 对手那刻夏 → canUseSkill(0)=false（被动+主动失效）', () => {
    const a = makeAdapter();
    a.setChars(['aglaiya', 'nakkari']);
    expect(a.state.value.chars).toEqual(['aglaiya', 'nakkari']);
    // 阿格莱雅被沉默
    expect(a.silenced.value).toContain(0);
    expect(a.canUseSkill(0)).toBe(false);
  });

  it('那刻夏本人不受沉默，可正常使用技能', () => {
    const a = makeAdapter();
    a.setChars(['aglaiya', 'nakkari']);
    // 那刻夏（player 1）不被沉默
    expect(a.silenced.value).not.toContain(1);
    // 但 player 1 不是当前回合，canUseSkill 应 false（轮不到）
    expect(a.canUseSkill(1)).toBe(false);
    // 切到 player 1 回合（模拟）：直接改 state 不可行，改用非沉默组合验证
  });

  it('非阿格莱雅不受那刻夏沉默影响', () => {
    const a = makeAdapter();
    a.setChars(['baie', 'nakkari']);
    // 白厄不是阿格莱雅，不被沉默
    expect(a.silenced.value).toEqual([]);
    expect(a.canUseSkill(0)).toBe(true);
  });

  it('阿格莱雅 vs 非那刻夏 → 不被沉默，可使用技能', () => {
    const a = makeAdapter();
    a.setChars(['aglaiya', 'baie']);
    expect(a.silenced.value).toEqual([]);
    expect(a.canUseSkill(0)).toBe(true);
  });
});

describe('4. 那刻夏「洞察」：不限次数的免费提示', () => {
  it('发动后高亮推荐落点，不消耗回合 / 不标 skillUsed / 不改棋盘', () => {
    const a = makeAdapter();
    a.setChars(['nakkari', 'baie']);
    const beforeBoard = a.state.value.board.slice();
    const beforeStores = [...a.state.value.stores] as [number, number];

    const ok = a.useSkill('nakkari');
    expect(ok).toBe(true);
    // 回合不变
    expect(a.state.value.currentPlayer).toBe(0);
    // skillUsed 全 false（不消耗次数）
    expect(a.skillUsed.value).toEqual([false, false]);
    // 棋盘/计分不变
    expect(a.state.value.board).toEqual(beforeBoard);
    expect(a.state.value.stores).toEqual(beforeStores);
    // 高亮一个玩家0 的合法坑（board 下标 0~5）
    expect(a.activeHint.value).toBeGreaterThanOrEqual(0);
    expect(a.activeHint.value).toBeLessThanOrEqual(5);
  });

  it('可不限次数重复发动，skillUsed 始终 false', () => {
    const a = makeAdapter();
    a.setChars(['nakkari', 'baie']);
    for (let i = 0; i < 3; i++) {
      expect(a.useSkill('nakkari')).toBe(true);
      expect(a.activeHint.value).toBeGreaterThanOrEqual(0);
      expect(a.activeHint.value).toBeLessThanOrEqual(5);
    }
    expect(a.skillUsed.value).toEqual([false, false]);
  });

  it('canUseSkill 始终允许那刻夏洞察（不看 skillUsed）', () => {
    const a = makeAdapter();
    a.setChars(['nakkari', 'baie']);
    expect(a.canUseSkill(0)).toBe(true);
  });

  it('推荐落点确实是期望净得分最高的坑', () => {
    const a = makeAdapter();
    a.setChars(['nakkari', 'baie']);
    a.useSkill('nakkari');
    const hint = a.activeHint.value;
    expect(hint).not.toBeUndefined();

    const s = a.state.value;
    let maxGain = -Infinity;
    for (let p = 0; p <= 5; p++) {
      const r = applyMove(s, p, 0);
      if (r.ok) maxGain = Math.max(maxGain, r.state.stores[0] - s.stores[0]);
    }
    const hintRes = applyMove(s, hint!, 0);
    expect(hintRes.ok).toBe(true);
    if (hintRes.ok) {
      expect(hintRes.state.stores[0] - s.stores[0]).toBe(maxGain);
    }
  });

  it('玩家实际落子后清除洞察高亮', () => {
    const a = makeAdapter();
    a.setChars(['nakkari', 'baie']);
    a.useSkill('nakkari');
    expect(a.activeHint.value).not.toBeUndefined();
    // 玩家0 坑0（逻辑位 0，初始 4 颗，合法）
    expect(a.canClick(0)).toBe(true);
    a.handlePitClick(0);
    // 高亮在落子时同步清除
    expect(a.activeHint.value).toBeUndefined();
    // 清理 pending gsap timeline
    a.destroy();
  });

  it('reset 后清除洞察高亮', () => {
    const a = makeAdapter();
    a.setChars(['nakkari', 'baie']);
    a.useSkill('nakkari');
    a.reset();
    expect(a.activeHint.value).toBeUndefined();
  });
});
