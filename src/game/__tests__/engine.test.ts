/**
 * 曼卡拉引擎单元测试（Vitest）
 * 覆盖：普通播种 / 额外回合 / 捕获 / 连续捕获 / 跨圈播种 /
 *       跳过对方计分坑 / 终局（含平局）/ 全部非法操作码 / 纯函数不变性
 */
import { describe, expect, it } from 'vitest';
import {
  INITIAL_BOARD,
} from '../constants';
import {
  applyMove,
  createInitialState,
  getLegalPits,
  getSowPath,
  isSideEmpty,
} from '../engine';
import { MoveErrorCode } from '../types';
import type { GameState, PlayerId } from '../types';

/** 构造自定义对局（测试专用工厂） */
function makeState(
  board: number[],
  currentPlayer: PlayerId = 0,
  turn = 0,
): GameState {
  return { board, currentPlayer, turn, finished: false, winner: null };
}

/** 非法落子的语法糖：断言失败并返回错误码 */
function expectError(state: GameState, pit: number, by?: PlayerId) {
  const result = applyMove(state, pit, by);
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: MoveErrorCode }).error;
}

describe('初始状态', () => {
  it('开局棋盘为经典 4 子布局，玩家0先手，turn=0', () => {
    const s = createInitialState();
    expect(s.board).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    expect(s.currentPlayer).toBe(0);
    expect(s.turn).toBe(0);
    expect(s.finished).toBe(false);
    expect(s.winner).toBeNull();
    expect(getLegalPits(s)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('普通播种', () => {
  it('坑0的4颗依次播入坑1~4，回合交给玩家1', () => {
    const r = applyMove(createInitialState(), 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.board).toEqual([
      0, 5, 5, 5, 5, 4, 0,
      4, 4, 4, 4, 4, 4, 0,
    ]);
    expect(r.lastIndex).toBe(4);
    expect(r.extraTurn).toBe(false);
    expect(r.captured).toBe(false);
    expect(r.state.currentPlayer).toBe(1);
    expect(r.state.turn).toBe(1);
  });

  it('跨圈播种：棋子绕场多圈时每圈都跳过对方计分坑', () => {
    // 坑0有15颗，其余全空
    const s = makeState([15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // 玩家0一圈可投13个位置（1..12 + 坑6，跳过坑13）：
    // 第1~13颗铺满 1..12 与坑0；第14颗到坑1，第15颗到坑2；坑13始终为0
    expect(r.state.board).toEqual([
      1, 2, 2, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 0,
    ]);
    expect(r.lastIndex).toBe(2);
    expect(r.captured).toBe(false); // 坑2落子前已有1颗，不构成空坑
  });
});

describe('额外回合', () => {
  it('最后一颗落入己方计分坑（坑2的4颗：3→4→5→6），玩家0连走', () => {
    const r = applyMove(createInitialState(), 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.board).toEqual([
      4, 4, 0, 5, 5, 5, 1,
      4, 4, 4, 4, 4, 4, 0,
    ]);
    expect(r.extraTurn).toBe(true);
    expect(r.state.currentPlayer).toBe(0); // 回合不切换
    expect(r.state.turn).toBe(1);
  });

  it('玩家1的最后一颗落入自己的计分坑13，同样获得额外回合', () => {
    // 玩家1先手视角：坑9的4颗 → 10,11,12,13
    const s = makeState(INITIAL_BOARD.slice(), 1);
    const r = applyMove(s, 9);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.extraTurn).toBe(true);
    expect(r.lastIndex).toBe(13);
    expect(r.state.currentPlayer).toBe(1);
  });
});

describe('空坑捕获', () => {
  it('最后一颗落入己方空坑，收走该子与对面坑全部棋子', () => {
    // 坑0有1颗 → 落入空坑1；对面坑11有8颗
    const s = makeState([1, 0, 4, 4, 4, 4, 0, 4, 4, 4, 4, 8, 4, 0]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.captured).toBe(true);
    expect(r.state.board[6]).toBe(9); // 1 + 8
    expect(r.state.board[1]).toBe(0);
    expect(r.state.board[11]).toBe(0);
    expect(r.state.board).toEqual([
      0, 0, 4, 4, 4, 4, 9,
      4, 4, 4, 4, 0, 4, 0,
    ]);
    expect(r.state.currentPlayer).toBe(1);
  });

  it('对面坑也为空时不触发捕获', () => {
    const s = makeState([1, 0, 4, 4, 4, 4, 0, 4, 4, 4, 4, 0, 4, 0]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured).toBe(false);
    expect(r.state.board[6]).toBe(0);
    expect(r.state.board[1]).toBe(1); // 棋子正常留在坑1
  });

  it('连续捕获：玩家0 → 玩家1 → 玩家0 三次捕获连环结算', () => {
    // 精心构造的初始盘面
    const s = makeState([1, 0, 1, 0, 4, 4, 0, 1, 0, 7, 4, 8, 4, 0]);

    // 第1手：玩家0 坑0→坑1，捕获坑11的8颗
    const r1 = applyMove(s, 0);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.captured).toBe(true);
    expect(r1.state.board[6]).toBe(9);
    expect(r1.state.board[11]).toBe(0);
    expect(r1.state.currentPlayer).toBe(1);

    // 第2手：玩家1 坑7→坑8，捕获坑4的4颗
    const r2 = applyMove(r1.state, 7);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.captured).toBe(true);
    expect(r2.state.board[13]).toBe(5);
    expect(r2.state.board[4]).toBe(0);
    expect(r2.state.currentPlayer).toBe(0);

    // 第3手：玩家0 坑2→坑3，捕获坑9的7颗
    const r3 = applyMove(r2.state, 2);
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.captured).toBe(true);
    expect(r3.state.board[6]).toBe(17); // 9 + 1 + 7
    expect(r3.state.board[9]).toBe(0);
    expect(r3.state.currentPlayer).toBe(1);
    expect(r3.state.turn).toBe(3);
    expect(r3.state.finished).toBe(false);
  });
});

describe('跳过对方计分坑', () => {
  it('玩家1播种经过坑6时不投放，且终局扫盘正确', () => {
    // 玩家1仅坑12有3颗：投放 13(自己计分坑) → 0 → 1
    const s = makeState([4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 3, 0], 1);
    const r = applyMove(s, 12);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // 玩家1坑位全空 → 终局；玩家0坑内26子扫入计分坑6
    expect(r.state.finished).toBe(true);
    expect(r.state.board).toEqual([
      0, 0, 0, 0, 0, 0, 26,
      0, 0, 0, 0, 0, 0, 1,
    ]);
    expect(r.state.winner).toBe(0);
  });
});

describe('终局判定', () => {
  it('一方坑位全空即终局，对方剩余棋子扫入计分坑后比多', () => {
    // 玩家0仅坑0有1颗，落入空坑1并捕获对面坑11的3颗 → 己方全空终局
    // 玩家1：坑11=3（被捕获）、坑12=4（终局扫盘）、计分坑13=5
    // 第二组 7 个数 = 坑7..12 + 计分坑13
    const s = makeState([1, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 3, 4, 5]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.finished).toBe(true);
    expect(isSideEmpty(r.state.board, 0)).toBe(true);
    expect(isSideEmpty(r.state.board, 1)).toBe(true);
    expect(r.state.board).toEqual([
      0, 0, 0, 0, 0, 0, 14, // 坑0..5 全空 + 计分坑6 = 10 + 捕获(3+1)
      0, 0, 0, 0, 0, 0, 9, // 坑7..12 全空 + 计分坑13 = 5 + 扫盘4
    ]);
    // 14 > 9：玩家0获胜
    expect(r.state.winner).toBe(0);
  });

  it('终局计分坑相等 → 平局，winner 为 null', () => {
    // 玩家0捕获：坑6 = 8 + 2 + 1 = 11；玩家1扫盘：坑13 = 7 + 4 = 11
    // 第二组 7 个数 = 坑7..12（坑11=2、坑12=4）+ 计分坑13=7
    const s = makeState([1, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 2, 4, 7]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.finished).toBe(true);
    expect(r.state.board[6]).toBe(11);
    expect(r.state.board[13]).toBe(11);
    expect(r.state.winner).toBeNull();
  });

  it('终局后 getLegalPits 返回空且不能再落子', () => {
    const s = makeState([1, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 2, 4, 7]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(getLegalPits(r.state)).toEqual([]);
    expect(expectError(r.state, 0)).toBe(MoveErrorCode.GameFinished);
  });
});

describe('非法操作', () => {
  it('空坑 → EMPTY_PIT', () => {
    const s = makeState([0, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    expect(expectError(s, 0)).toBe(MoveErrorCode.EmptyPit);
  });

  it('对方坑位 → OPPONENT_PIT', () => {
    expect(expectError(createInitialState(), 7)).toBe(MoveErrorCode.OpponentPit);
    expect(expectError(createInitialState(), 12)).toBe(MoveErrorCode.OpponentPit);
  });

  it('越界 / 计分坑 / 非整数 → INVALID_PIT', () => {
    const s = createInitialState();
    expect(expectError(s, 6)).toBe(MoveErrorCode.InvalidPit);   // 己方计分坑
    expect(expectError(s, 13)).toBe(MoveErrorCode.InvalidPit);  // 对方计分坑
    expect(expectError(s, 14)).toBe(MoveErrorCode.InvalidPit);
    expect(expectError(s, -1)).toBe(MoveErrorCode.InvalidPit);
    expect(expectError(s, 1.5)).toBe(MoveErrorCode.InvalidPit);
  });

  it('非当前回合玩家发起 → NOT_YOUR_TURN', () => {
    // 明明轮到玩家0，玩家1却声称落子
    expect(expectError(createInitialState(), 0, 1)).toBe(
      MoveErrorCode.NotYourTurn,
    );
  });

  it('对局已结束 → GAME_FINISHED', () => {
    const finished: GameState = {
      ...createInitialState(),
      finished: true,
      winner: 0,
    };
    expect(expectError(finished, 0)).toBe(MoveErrorCode.GameFinished);
  });

  it('非法落子不改变原状态（防误操作误伤棋盘）', () => {
    const s = createInitialState();
    const snapshot = s.board.slice();
    applyMove(s, 7);
    applyMove(s, 0, 1);
    expect(s.board).toEqual(snapshot);
    expect(s.turn).toBe(0);
  });

  it('合法落子同样不修改入参（纯函数）', () => {
    const s = createInitialState();
    const snapshot = s.board.slice();
    applyMove(s, 0);
    expect(s.board).toEqual(snapshot);
  });
});

describe('getSowPath（播种路径，UI 动画用）', () => {
  it('坑0的4颗 → 路径 1,2,3,4', () => {
    expect(getSowPath([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], 0)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('玩家0坑5的8颗 → 绕过对方计分坑13回到坑0', () => {
    expect(getSowPath([0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0], 5)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 0,
    ]);
  });

  it('玩家1坑12的3颗 → 先入己方计分坑13再进对方地盘', () => {
    expect(getSowPath([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0], 12)).toEqual([
      13, 0, 1,
    ]);
  });
});
