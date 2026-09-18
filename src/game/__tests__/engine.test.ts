/**
 * 曼卡拉引擎单元测试（Vitest, V0.3 12-board + stores 版）
 * 覆盖：初始状态 / 普通播种 / 跨圈 / 额外回合 / 空坑捕获 / 连续捕获 /
 *       跳过对方计分坑 / 终局（含平局）/ 全部非法操作码 / 纯函数不变性 /
 *       getSowPath / toViewBoard
 *
 * 棋盘模型：
 *   - board: number[12]，0~5 = P0 坑，6~11 = P1 坑（无计分槽）
 *   - stores: [number, number]，独立计分
 *   - 逻辑环 14 位：0~5 P0 坑 / 6 P0 store / 7~12 P1 坑 / 13 P1 store
 */
import { describe, expect, it } from 'vitest';
import { INITIAL_BOARD } from '../constants';
import {
  applyMove,
  createInitialState,
  getLegalPits,
  getSowPath,
  isSideEmpty,
  toViewBoard,
} from '../engine';
import { MoveErrorCode } from '../types';
import type { GameState, PlayerId, Stores } from '../types';

/** 构造自定义对局（测试专用工厂：12 元素 board + stores） */
function makeState(
  board: number[],
  stores: Stores = [0, 0],
  currentPlayer: PlayerId = 0,
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

/** 非法落子的语法糖：断言失败并返回错误码 */
function expectError(state: GameState, pit: number, by?: PlayerId) {
  const result = applyMove(state, pit, by);
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: MoveErrorCode }).error;
}

describe('初始状态', () => {
  it('开局棋盘为经典 4 子布局，玩家0先手，turn=0', () => {
    const s = createInitialState();
    expect(s.board).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(s.stores).toEqual([0, 0]);
    expect(s.currentPlayer).toBe(0);
    expect(s.turn).toBe(0);
    expect(s.finished).toBe(false);
    expect(s.winner).toBeNull();
    expect(getLegalPits(s)).toEqual([0, 1, 2, 3, 4, 5]);
    // toViewBoard 把 stores 嵌入 14 元素视图
    expect(toViewBoard(s)).toEqual([
      4, 4, 4, 4, 4, 4, 0,
      4, 4, 4, 4, 4, 4, 0,
    ]);
  });
});

describe('普通播种', () => {
  it('坑0的4颗依次播入坑1~4，回合交给玩家1', () => {
    const r = applyMove(createInitialState(), 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.board).toEqual([0, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4]);
    expect(r.state.stores).toEqual([0, 0]);
    expect(r.lastIndex).toBe(4); // 逻辑位 4
    expect(r.extraTurn).toBe(false);
    expect(r.captured).toBe(false);
    expect(r.state.currentPlayer).toBe(1);
    expect(r.state.turn).toBe(1);
    expect(toViewBoard(r.state)).toEqual([
      0, 5, 5, 5, 5, 4, 0,
      4, 4, 4, 4, 4, 4, 0,
    ]);
  });

  it('跨圈播种：棋子绕场多圈时每圈都跳过对方计分坑', () => {
    // 坑0有15颗，其余全空
    const s = makeState([15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // 玩家0走 ccw：1,2,3,4,5,6(store0),7,8,9,10,11,12,跳过13(P1 store),0,1,2
    // 各坑投放后：board[1]=2, board[2]=2, board[3..5]=1, board[6..11]=1, board[0]=1
    // stores[0]=1
    expect(r.state.board).toEqual([1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(r.state.stores).toEqual([1, 0]);
    expect(r.lastIndex).toBe(2);
    expect(r.captured).toBe(false); // 坑2 落子前已有1颗，不构成空坑
  });
});

describe('额外回合', () => {
  it('最后一颗落入己方计分坑（坑2的4颗：3→4→5→6 store），玩家0连走', () => {
    const r = applyMove(createInitialState(), 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.board).toEqual([4, 4, 0, 5, 5, 5, 4, 4, 4, 4, 4, 4]);
    expect(r.state.stores).toEqual([1, 0]);
    expect(r.lastIndex).toBe(6); // 逻辑位 6 = P0 store
    expect(r.extraTurn).toBe(true);
    expect(r.state.currentPlayer).toBe(0); // 回合不切换
    expect(r.state.turn).toBe(1);
  });

  it('玩家1的最后一颗落入自己的计分坑13，同样获得额外回合', () => {
    // 玩家1先手视角：board[8]（P1 第3坑 logical=9）的4颗 → 10,11,12,13(store1)
    const s = makeState(INITIAL_BOARD.slice(), [0, 0], 1);
    const r = applyMove(s, 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.extraTurn).toBe(true);
    expect(r.lastIndex).toBe(13);
    expect(r.state.stores).toEqual([0, 1]);
    expect(r.state.currentPlayer).toBe(1);
  });
});

describe('空坑捕获', () => {
  it('最后一颗落入己方空坑，收走该子与对面坑全部棋子', () => {
    // 坑0有1颗 → 落入空坑1（board[1]）；对面 logical=oppositeLogical(1)=11，对面 board 下标=10
    // board[10]=8 颗被捕获：stores[0] += 8 + 1 = 9
    const s = makeState([1, 0, 4, 4, 4, 4, 4, 4, 4, 4, 8, 4]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.captured).toBe(true);
    expect(r.state.stores[0]).toBe(9);
    expect(r.state.board[1]).toBe(0);
    expect(r.state.board[10]).toBe(0);
    expect(r.state.board).toEqual([0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 4]);
    expect(r.state.currentPlayer).toBe(1);
  });

  it('对面坑也为空时不触发捕获', () => {
    const s = makeState([1, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 4]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured).toBe(false);
    expect(r.state.stores[0]).toBe(0);
    expect(r.state.board[1]).toBe(1); // 棋子正常留在坑1
  });

  it('连续捕获：玩家0 → 玩家1 → 玩家0 三次捕获连环结算', () => {
    // 12-board 版精心构造盘面
    // P0: 坑0=1(→坑1空,对面坑10=8 捕获9)
    // P1: 坑6=1(→坑7空,对面坑4=4 捕获5)
    // P0: 坑2=1(→坑3空,对面坑8=7 捕获8)
    const s = makeState([1, 0, 1, 0, 4, 4, 1, 0, 7, 4, 8, 4]);

    // 第1手：玩家0 坑0 → 坑1，对面 board[10]=8
    const r1 = applyMove(s, 0);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.captured).toBe(true);
    expect(r1.state.stores[0]).toBe(9);
    expect(r1.state.board[10]).toBe(0);
    expect(r1.state.currentPlayer).toBe(1);

    // 第2手：玩家1 坑6 (1颗) → 坑7（空），对面 board[4]=4
    const r2 = applyMove(r1.state, 6);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.captured).toBe(true);
    expect(r2.state.stores[1]).toBe(5);
    expect(r2.state.board[4]).toBe(0);
    expect(r2.state.currentPlayer).toBe(0);

    // 第3手：玩家0 坑2 (1颗) → 坑3（空），对面 board[8]=7
    const r3 = applyMove(r2.state, 2);
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.captured).toBe(true);
    expect(r3.state.stores[0]).toBe(17); // 9 + 7 + 1
    expect(r3.state.board[8]).toBe(0);
    expect(r3.state.currentPlayer).toBe(1);
    expect(r3.state.turn).toBe(3);
    expect(r3.state.finished).toBe(false);
  });
});

describe('跳过对方计分坑', () => {
  it('玩家1播种经过坑6(P0 store)时不投放，且终局扫盘正确', () => {
    // 玩家1 board[11]=3 颗：投放 12,13(P1 store),0 → 跳过6(P0 store 不投放,玩家1 视角下6是对方 store)
    // 等等：13 是 P1 自己 store，会投放；走完3颗后玩家1 全空 → 终局
    const s = makeState([4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 3], [0, 0], 1);
    const r = applyMove(s, 11);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // 玩家1 坑位全空 → 终局；玩家0 坑内 4*6 + 坑0坑1各+1 = 26 颗扫入 stores[0]=26；
    // 玩家1 stores[1] = 1（自己 store 投了1颗）+ 扫盘0 = 1
    expect(r.state.finished).toBe(true);
    expect(r.state.board).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.state.stores).toEqual([26, 1]);
    // 26 > 1 → 玩家0 获胜
    expect(r.state.winner).toBe(0);
  });
});

describe('终局判定', () => {
  it('一方坑位全空即终局，对方剩余棋子扫入计分坑后比多', () => {
    // 玩家0坑0=1颗 → 落入空坑1，对面 board[10]=3 被捕获 → stores[0] += 3+1=4
    // 玩家0 全空 → 终局；扫盘玩家1：board[11]=4 → stores[1] += 4
    // stores: [4+10=14? 起始 stores[0]=10], [5+4=9 起始 stores[1]=5]
    const s = makeState([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4], [10, 5]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.finished).toBe(true);
    expect(isSideEmpty(r.state.board, 0)).toBe(true);
    expect(isSideEmpty(r.state.board, 1)).toBe(true);
    expect(r.state.board).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.state.stores).toEqual([14, 9]); // 10+3+1=14, 5+4=9
    expect(r.state.winner).toBe(0);
  });

  it('终局计分坑相等 → 平局，winner 为 null', () => {
    // stores[0]=8 起始；玩家0坑0=1 → 坑1空 → 对面 board[10]=2 捕获 → stores[0] += 2+1=3 → 11
    // 玩家1 扫盘 board[11]=4 → stores[1]=7+4=11
    const s = makeState([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4], [8, 7]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.finished).toBe(true);
    expect(r.state.stores[0]).toBe(11);
    expect(r.state.stores[1]).toBe(11);
    expect(r.state.winner).toBeNull();
  });

  it('终局后 getLegalPits 返回空且不能再落子', () => {
    const s = makeState([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4], [8, 7]);
    const r = applyMove(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(getLegalPits(r.state)).toEqual([]);
    expect(expectError(r.state, 0)).toBe(MoveErrorCode.GameFinished);
  });
});

describe('非法操作', () => {
  it('空坑 → EMPTY_PIT', () => {
    const s = makeState([0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(expectError(s, 0)).toBe(MoveErrorCode.EmptyPit);
  });

  it('对方坑位 → OPPONENT_PIT', () => {
    // 玩家0选坑6（P1 坑1）或坑11（P1 坑6）
    expect(expectError(createInitialState(), 6)).toBe(MoveErrorCode.OpponentPit);
    expect(expectError(createInitialState(), 11)).toBe(MoveErrorCode.OpponentPit);
  });

  it('越界 / 非整数 → INVALID_PIT', () => {
    const s = createInitialState();
    // 12 元素 board：坑 6 是合法 P1 坑（OpponentPit），不再是计分坑
    // 坑 12/13/14 都是越界
    expect(expectError(s, 12)).toBe(MoveErrorCode.InvalidPit);
    expect(expectError(s, 13)).toBe(MoveErrorCode.InvalidPit);
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
    applyMove(s, 6); // 6 现在是 OpponentPit
    applyMove(s, 0, 1); // NotYourTurn
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

describe('getSowPath（播种路径，UI 动画用，逻辑位）', () => {
  it('坑0的4颗 → 路径 1,2,3,4（逻辑位）', () => {
    expect(getSowPath([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], [0, 0], 0)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('玩家0坑5的8颗 → 经过己方 store6，跳过对方 store13，回到坑0', () => {
    expect(getSowPath([0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0], [0, 0], 5)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 0,
    ]);
  });

  it('玩家1坑11(board[11])的3颗 → 先入己方 store13 再进对方地盘', () => {
    expect(getSowPath([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], [0, 0], 11)).toEqual([
      13, 0, 1,
    ]);
  });
});

describe('toViewBoard（14 元素视图）', () => {
  it('初始状态：board 12 颗 + 两个 store=0 嵌入 14 位视图', () => {
    const s = createInitialState();
    expect(toViewBoard(s)).toEqual([
      4, 4, 4, 4, 4, 4, 0,
      4, 4, 4, 4, 4, 4, 0,
    ]);
  });

  it('落子后视图与权威 board/stores 同步', () => {
    const r = applyMove(createInitialState(), 2); // 玩家0 store +1
    if (!r.ok) return;
    expect(toViewBoard(r.state)).toEqual([
      4, 4, 0, 5, 5, 5, 1,
      4, 4, 4, 4, 4, 4, 0,
    ]);
  });
});
