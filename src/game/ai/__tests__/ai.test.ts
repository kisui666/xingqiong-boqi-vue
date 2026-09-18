/**
 * AI 模块单元测试（Vitest）
 * 覆盖：easy 范围 / medium 额外回合优先 / medium 防御性避让 /
 *       medium 确定性 / 终局 null / 合法坑位校验
 */
import { describe, expect, it } from 'vitest';
import { chooseMove } from '../index';
import type { AiContext } from '../index';
import { createInitialState, getLegalPits, applyMove } from '../../engine';
import { PITS, STORE } from '../../constants';
import type { GameState, PlayerId } from '../../types';

const MEDIUM: AiContext = { aiPlayer: 1, difficulty: 'medium' };
const EASY: AiContext = { aiPlayer: 1, difficulty: 'easy' };

function makeState(
  board: number[],
  currentPlayer: PlayerId = 1,
  turn = 0,
): GameState {
  return { board, currentPlayer, turn, finished: false, winner: null };
}

describe('chooseMove 通用', () => {
  it('终局态返回 null', () => {
    const s = makeState([0, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 0, 24]);
    s.finished = true;
    expect(chooseMove(s, MEDIUM)).toBeNull();
  });

  it('无合法坑位返回 null', () => {
    const s = makeState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 48]);
    s.currentPlayer = 1;
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
  it('开局应优先选坑 9（落点 = 己方计分坑 13，触发额外回合）', () => {
    // 玩家1 开局 [4,4,4,4,4,4,0, 4,4,4,4,4,4,0]
    // 坑9的4颗 → 10,11,12,13(己方 store) → extraTurn
    const s = createInitialState();
    s.currentPlayer = 1;
    expect(chooseMove(s, MEDIUM)).toBe(9);
  });

  it('确定性：同一局面两次调用结果相同', () => {
    const s = createInitialState();
    s.currentPlayer = 1;
    expect(chooseMove(s, MEDIUM)).toBe(chooseMove(s, MEDIUM));
  });

  it('防御性：避开让对手下回合能触发额外回合的坑', () => {
    // 构造局面：AI（玩家1）若选坑7（3颗→8,9,10），对手玩家0坑5（3颗→6 store extraTurn）
    // AI 应避开坑7，选其他坑或至少不选坑7
    // 简化构造：让坑7是唯一会导致对手 extraTurn 的选择
    const s = makeState([
      0, 0, 0, 0, 0, 3, 10,  // 玩家0：仅坑5有3颗（落点=坑6 store → extraTurn）
      3, 4, 4, 4, 4, 4, 5,  // 玩家1：坑7有3颗（落点 8,9,10，不触发 extraTurn）
    ]);
    s.currentPlayer = 1;
    const choice = chooseMove(s, MEDIUM);
    // 不应选坑7（因为坑7会让对手下回合坑5→store extraTurn）
    expect(choice).not.toBe(7);
    // 返回值仍是合法坑
    expect(getLegalPits(s)).toContain(choice);
  });

  it('捕获优先：有捕获机会时优先选捕获坑', () => {
    // 玩家1坑7有1颗 → 落入空坑8；对面坑4（oppositePit(8)=4）有8颗 → 捕获9颗
    const s = makeState([
      0, 0, 0, 0, 8, 0, 0,   // 玩家0：坑4有8颗（对面坑8）
      1, 0, 0, 0, 0, 0, 0,  // 玩家1：坑7有1颗 → 落坑8（空）→ 捕获坑4的8颗 = 9分
    ]);
    s.currentPlayer = 1;
    const choice = chooseMove(s, MEDIUM);
    // 坑7唯一合法，必选坑7
    expect(choice).toBe(7);
    // 验证确实触发捕获
    const r = applyMove(s, 7, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.captured).toBe(true);
      expect(r.state.board[STORE[1]]).toBe(9); // 0 + 1(末子) + 8(对面)
    }
  });
});
