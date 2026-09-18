/**
 * AI 模块单元测试（Vitest, V0.3 12-board + stores 版）
 * 覆盖：easy 范围 / medium 额外回合优先 / medium 防御性避让 /
 *       medium 确定性 / medium 捕获优先 / 终局 null / 合法坑位校验
 *
 * 12-board 模型：玩家0 坑=board[0..5]，玩家1 坑=board[6..11]；
 * P1 坑8 (board[8]) 4颗走 ccw → 末子落 logical=13 (P1 store) 触发 extraTurn。
 */
import { describe, expect, it } from 'vitest';
import { chooseMove } from '../index';
import type { AiContext } from '../index';
import { applyMove, createInitialState, getLegalPits } from '../../engine';
import type { GameState, PlayerId, Stores } from '../../types';

const MEDIUM: AiContext = { aiPlayer: 1, difficulty: 'medium' };
const EASY: AiContext = { aiPlayer: 1, difficulty: 'easy' };

function makeState(
  board: number[],
  stores: Stores = [0, 0],
  currentPlayer: PlayerId = 1,
  turn = 0,
): GameState {
  return {
    board,
    stores,
    currentPlayer,
    turn,
    finished: false,
    winner: null,
    chars: ['', ''],
    skillUsed: [false, false],
    effects: [],
  };
}

describe('chooseMove 通用', () => {
  it('终局态返回 null', () => {
    const s = makeState([0, 0, 0, 0, 0, 0, 0, 0, 0,0, 0, 0], [24, 24], 1);
    s.finished = true;
    expect(chooseMove(s, MEDIUM)).toBeNull();
  });

  it('无合法坑位返回 null', () => {
    const s = makeState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 48], 1);
    expect(chooseMove(s, MEDIUM)).toBeNull();
  });
});

describe('easy 策略', () => {
  it('返回值必在合法坑位集合内', () => {
    const s = createInitialState();
    s.currentPlayer = 1;
    const legal = getLegalPits(s);
    const choice = chooseMove(s, EASY);
    expect(choice).not.toBeNull();
    expect(legal).toContain(choice);
  });

  it('多次调用结果分布合法（随机性健康）', () => {
    const s = createInitialState();
    s.currentPlayer = 1;
    const legal = getLegalPits(s);
    for (let i = 0; i < 20; i++) {
      expect(legal).toContain(chooseMove(s, EASY));
    }
  });
});

describe('medium 策略', () => {
  it('开局应优先选坑 8（落点 = 己方计分坑 13，触发额外回合）', () => {
    // 玩家1 开局 board[0..5]=[4,4,4,4,4,4] / board[6..11]=[4,4,4,4,4,4]
    // 坑8 (board[8]) 4颗 → logical 10,11,12,13(P1 store) → extraTurn
    const s = createInitialState();
    s.currentPlayer = 1;
    expect(chooseMove(s, MEDIUM)).toBe(8);
  });

  it('确定性：同一局面两次调用结果相同', () => {
    const s = createInitialState();
    s.currentPlayer = 1;
    expect(chooseMove(s, MEDIUM)).toBe(chooseMove(s, MEDIUM));
  });

  it('防御性：避开让对手下回合能触发额外回合的坑', () => {
    // 构造：玩家0 坑5=1 颗（→ logical 6 store0 → extraTurn）
    // AI（玩家1）若选坑6（3颗→8,9,10）不改 P0 坑5，对手下回合坑5→extraTurn → 扣800
    // AI 若选坑11（7颗→13,0,1,2,3,4,5），P0 坑5 被填到 2 颗，下回合坑5→logical 6,7 不 extraTurn
    const s = makeState(
      [0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 7],
      [0, 0],
      1,
    );
    const choice = chooseMove(s, MEDIUM);
    // 不应选坑6（会让对手下回合 extraTurn）
    expect(choice).not.toBe(6);
    // 返回值仍是合法坑
    expect(getLegalPits(s)).toContain(choice);
  });

  it('捕获优先：有捕获机会时优先选捕获坑', () => {
    // 玩家1坑6 (board[6]) 1颗 → 落入空坑7（board[7]）；对面 logical=oppositeLogical(8)=4，
    // 对面 board 下标=4，board[4]=8 颗 → 捕获 8+1=9 颗进 stores[1]
    const s = makeState(
      [0, 0, 0, 0, 8, 0, 1, 0, 0, 0, 0, 0],
      [0, 0],
      1,
    );
    const choice = chooseMove(s, MEDIUM);
    // 坑6 唯一合法，必选坑6
    expect(choice).toBe(6);
    // 验证确实触发捕获
    const r = applyMove(s, 6, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.captured).toBe(true);
      expect(r.state.stores[1]).toBe(9); // 0 + 1(末子) + 8(对面)
    }
  });
});
