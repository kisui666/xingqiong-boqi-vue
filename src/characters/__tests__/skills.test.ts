/**
 * 角色技能系统单测（V0.3 Step 1）
 * ==================================================================
 * 10 条核心断言，覆盖：
 *   1. nakkari-silence：那刻夏沉默阿格莱雅
 *   2. xiadie-baseline：遐蝶保底留1
 *   3. danheng-immune：丹恒 ≥6 免捕获 + 海瑟音重分配后可捕获
 *   4. baie-cap：白厄翻倍上限12 + extraTurn 一次不无限
 *   5. wandi-halve：万敌一半进商店一半播种
 *   6. changyueyue-forget：长夜月遗忘 3 回合到期清理
 *   7. xilian-rewind：昔涟悔棋恢复快照
 *   8. tibao-transport：缇宝传送不消耗本回合 + cw/ccw 方向
 *   9. saifeier-halve：赛飞儿减半（4 种 n 值）
 *  10. online-blindselect：联机盲选消息不含角色 id
 */
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createInitialState,
  sowSeeds,
  captureStones,
} from '../../game/engine';
import { createDispatcher } from '../dispatch';
import {
  aglaiya,
  baie,
  changyueyue,
  danheng,
  haiseyin,
  saifeier,
  tibao,
  wandi,
  xilian,
} from '../data';
import type { ActiveContext } from '../types';
import type { GameState, PlayerId, Stores } from '../../game/types';
import { buildMessage, validateMessageStructure } from '../../p2p/protocol';

const REMOTE = 'xqboqi-host-ABC12';
const GUEST = 'xqboqi-g-xyz99';

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

function makeCtx(state: GameState, player: PlayerId): ActiveContext {
  return { state, player, sowSeeds, captureStones, applyMove };
}

// ==================== 1. 那刻夏沉默阿格莱雅 ====================

describe('1. nakkari-silence：那刻夏沉默阿格莱雅', () => {
  it('对手为那刻夏时阿格莱雅被动 onPitFilled 返回 0（被沉默）', () => {
    // P1 (nakkari) 选坑11 (board[11]) 7颗 → 播种路径 13,0,1,2,3,4,5
    // 经过 P0 坑0-5（owner=0=aglaiya），每个坑 0→1 触发 onPitFilled
    // 阿格莱雅被动应 +2，但被那刻夏沉默 → 0
    // 留 P1 坑10=1 避免终局扫盘干扰 stores
    const state = makeState(
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 7],
      [0, 0],
      1,
    );
    state.chars = ['aglaiya', 'nakkari'];
    const dispatcher = createDispatcher(['aglaiya', 'nakkari']);
    const hooks = dispatcher.buildHooks(state, 1);
    const r = applyMove(state, 11, 1, hooks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 沉默生效：stores[0] 不获得阿格莱雅 +2 加分
    expect(r.state.stores[0]).toBe(0);
    // P0 坑确实被填到 1（但无加分）
    expect(r.state.board[0]).toBe(1);
    expect(r.state.board[5]).toBe(1);
  });

  it('对照：对手非那刻夏时阿格莱雅被动正常 +2', () => {
    const state = makeState(
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 7],
      [0, 0],
      1,
    );
    state.chars = ['aglaiya', ''];
    const dispatcher = createDispatcher(['aglaiya', '']);
    const hooks = dispatcher.buildHooks(state, 1);
    const r = applyMove(state, 11, 1, hooks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 6 个 P0 坑被填满，每个 +2 = 12 进 stores[0]
    expect(r.state.stores[0]).toBe(12);
  });
});

// ==================== 2. 遐蝶保底留1 ====================

describe('2. xiadie-baseline：遐蝶被捕获时保底留1', () => {
  it('对面坑=5（≥2）→ take=4, leave=1，末子仍入对方计分', () => {
    // 玩家0 坑0=1 → 落入空坑1；对面 logical=11 → board[10]=5（遐蝶坑）
    // 遐蝶被动：take=max(5-1,0)=4, leave=1
    // stores[0] += 4 + 1(末子) = 5；board[10]=1（留1）
    const state = makeState(
      [1, 0, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4],
      [0, 0],
      0,
    );
    state.chars = ['', 'xiadie'];
    const dispatcher = createDispatcher(['', 'xiadie']);
    const hooks = dispatcher.buildHooks(state, 0);
    const r = applyMove(state, 0, 0, hooks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured).toBe(true);
    expect(r.state.stores[0]).toBe(5); // 4 + 1
    expect(r.state.board[10]).toBe(1); // 保底留1
    expect(r.state.board[1]).toBe(0); // 末子被收
  });

  it('对面坑=1 时遐蝶 take=0（实际等于没捕获）', () => {
    // board[10]=1，take=max(0,0)=0, leave=1 → 实际末子仍进 store, 对面留1
    const state = makeState(
      [1, 0, 4, 4, 4, 4, 4, 4, 4, 4, 1, 4],
      [0, 0],
      0,
    );
    state.chars = ['', 'xiadie'];
    const dispatcher = createDispatcher(['', 'xiadie']);
    const hooks = dispatcher.buildHooks(state, 0);
    const r = applyMove(state, 0, 0, hooks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured).toBe(true);
    expect(r.state.stores[0]).toBe(1); // 0 + 末子1
    expect(r.state.board[10]).toBe(1); // 留1（保底）
  });
});

// ==================== 3. 丹恒 ≥6 免捕获 + 海瑟音重分配 ====================

describe('3. danheng-immune：丹恒 ≥6 免捕获，重分配后可捕获', () => {
  it('对面坑=6（丹恒）→ 免捕获，take=0, leave=6', () => {
    const state = makeState(
      [1, 0, 4, 4, 4, 4, 4, 4, 4, 4, 6, 4],
      [0, 0],
      0,
    );
    state.chars = ['', 'danheng'];
    const dispatcher = createDispatcher(['', 'danheng']);
    const hooks = dispatcher.buildHooks(state, 0);
    const r = applyMove(state, 0, 0, hooks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured).toBe(true);
    expect(r.state.stores[0]).toBe(1); // 0 + 末子1
    expect(r.state.board[10]).toBe(6); // 保留
  });

  it('海瑟音重分配把该坑改到 4（<6）后，再捕获能 take', () => {
    // 起始 board[10]=6，先用海瑟音重分配 P1 行
    const stateHai = makeState(
      [1, 0, 4, 4, 4, 4, 4, 4, 4, 4, 6, 4],
      [0, 0],
      1,
    );
    stateHai.chars = ['', 'danheng'];
    const ctxHai = makeCtx(stateHai, 1);
    const hai = haiseyin.active!(ctxHai, 0, 1, 'ccw'); // targetPit=1 → P1 行
    // P1 行 total = 4+4+4+4+6+4 = 26, base=4, rem=2 → board[6..11]=[5,5,4,4,4,4]
    expect(hai.board[10]).toBe(4); // < 6 现在可被捕获

    // 用重分配后的 board 重新构造捕获场景
    const state2 = makeState(hai.board.slice(), [0, 0], 0);
    state2.chars = ['', 'danheng'];
    const dispatcher = createDispatcher(['', 'danheng']);
    const hooks = dispatcher.buildHooks(state2, 0);
    const r = applyMove(state2, 0, 0, hooks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured).toBe(true);
    // board[10]=4 < 6 → 不免捕获 → take=4 + 末子1 = 5
    expect(r.state.stores[0]).toBe(5);
    expect(r.state.board[10]).toBe(0);
  });
});

// ==================== 4. 白厄翻倍上限12 + extraTurn 一次 ====================

describe('4. baie-cap：白厄翻倍上限12，extraTurn 仅一次', () => {
  it('n=8 翻倍 → 16 被 cap 到 12；播种 12 颗全用完', () => {
    const state = makeState([8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0], 0);
    state.chars = ['baie', ''];
    const ctx = makeCtx(state, 0);
    const r = baie.active!(ctx, 0);
    // 12 颗 from logical=0: 1,2,3,4,5,6(store0 +1),7,8,9,10,11,12
    // board[1..5]=1×5, stores[0]=1, board[6..11]=1×6
    expect(r.board[0]).toBe(0);
    expect(r.stores[0]).toBe(1);
    expect(r.board[1] + r.board[2] + r.board[3] + r.board[4] + r.board[5]).toBe(5);
    expect(
      r.board[6] + r.board[7] + r.board[8] + r.board[9] + r.board[10] + r.board[11],
    ).toBe(6);
    expect(r.extraTurn).toBe(false); // 末子落 logical=12 非 store
  });

  it('n=3 翻倍 → 6 颗，末子入 store0 → extraTurn 一次（不无限循环）', () => {
    const state = makeState([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0], 0);
    state.chars = ['baie', ''];
    const ctx = makeCtx(state, 0);
    const r = baie.active!(ctx, 0);
    // 6 颗 from logical=0: 1,2,3,4,5,6(store0 +1) → lastIndex=6 store → extraTurn
    expect(r.extraTurn).toBe(true);
    expect(r.stores[0]).toBe(1);
    expect(r.board[0]).toBe(0);
    expect(r.board[6]).toBe(0); // 末子进 store，不在 P1 坑
    // active 仅跑一次 sowSeeds，不会自动连锁，extraTurn 仅返回 true 一次
  });
});

// ==================== 5. 万敌一半进商店一半播种 ====================

describe('5. wandi-halve：万敌 n=5/n=4 半入仓半播种', () => {
  it('n=5 → storeAdd=2, sowStones=3', () => {
    const state = makeState([5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0], 0);
    state.chars = ['wandi', ''];
    const ctx = makeCtx(state, 0);
    const r = wandi.active!(ctx, 0);
    // stores[0] += 2；board[0]=3→0（播种取走3颗）；board[1..3] 各+1
    expect(r.stores[0]).toBe(2);
    expect(r.board[0]).toBe(0);
    expect(r.board[1]).toBe(1);
    expect(r.board[2]).toBe(1);
    expect(r.board[3]).toBe(1);
    expect(r.extraTurn).toBe(false); // 末子落 logical=3 非 store 不 extraTurn；无捕获
  });

  it('n=4 → storeAdd=2, sowStones=2', () => {
    const state = makeState([4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0], 0);
    state.chars = ['wandi', ''];
    const ctx = makeCtx(state, 0);
    const r = wandi.active!(ctx, 0);
    expect(r.stores[0]).toBe(2);
    expect(r.board[0]).toBe(0);
    expect(r.board[1]).toBe(1);
    expect(r.board[2]).toBe(1);
  });
});

// ==================== 6. 长夜月遗忘 3 回合到期清理 ====================

describe('6. changyueyue-forget：遗忘 3 回合到期清理 + 期间免捕获', () => {
  // 构造：玩家1 坑6 (board[6]=1) → 末子落 logical=8 (board[7] 空) →
  // 对面 logical=oppositeLogical(8)=4 → board[4] 是 forget 目标
  // 因此 forget effect pit=4。留 P1 坑10=1 防止终局扫盘
  it('贴 forget(owner=0, pit=4, remainTurns=3)', () => {
    const state = makeState([0, 0, 0, 0, 5, 0, 1, 0, 0, 0, 1, 0], [0, 0], 1);
    state.chars = ['', 'changyueyue'];
    const ctx = makeCtx(state, 1);
    // changyueyue 主动：给对手 P0 坑4 贴 forget
    const r = changyueyue.active!(ctx, 0, 4, 'ccw');
    expect(r.effects).toHaveLength(1);
    expect(r.effects![0]).toMatchObject({
      type: 'forget',
      owner: 0,
      pit: 4,
      remainTurns: 3,
    });
  });

  it('期间 onCapture 对该坑 take=0（免捕获）', () => {
    const state = makeState([0, 0, 0, 0, 5, 0, 1, 0, 0, 0, 1, 0], [0, 0], 1);
    state.chars = ['', 'changyueyue'];
    state.effects = [
      { type: 'forget', owner: 0, pit: 4, remainTurns: 3 },
    ];
    // 玩家1 坑6 (board[6]=1) → logical=8 (board[7] 空) → 对面 logical=4 → board[4]=5
    // forget pit=4 → onCapture(4, 5, 0) → take=0, leave=5
    const dispatcher = createDispatcher(['', 'changyueyue']);
    const hooks = dispatcher.buildHooks(state, 1);
    const r = applyMove(state, 6, 1, hooks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured).toBe(true);
    expect(r.state.stores[1]).toBe(1); // take=0 + 末子1
    expect(r.state.board[4]).toBe(5); // 保留（forget 免捕获）
    expect(r.state.board[7]).toBe(0); // 末子被收
  });

  it('onTurnStart(owner=0) 三次后 forget 移除', () => {
    const state = makeState([0, 0, 0, 0, 5, 0, 1, 0, 0, 0, 1, 0], [0, 0], 1);
    state.chars = ['', 'changyueyue'];
    state.effects = [
      { type: 'forget', owner: 0, pit: 4, remainTurns: 3 },
    ];
    const dispatcher = createDispatcher(['', 'changyueyue']);
    let s = state;
    s = dispatcher.onTurnStart(s, 0);
    expect(s.effects[0].remainTurns).toBe(2);
    s = dispatcher.onTurnStart(s, 0);
    expect(s.effects[0].remainTurns).toBe(1);
    s = dispatcher.onTurnStart(s, 0);
    expect(s.effects).toHaveLength(0); // 到期清理
  });

  it('forget 到期后该坑可被正常捕获', () => {
    // P0 坑2=1 防止终局扫盘（捕获 board[4] 后 P0 仍有坑2）
    const state = makeState([0, 0, 1, 0, 5, 0, 1, 0, 0, 0, 1, 0], [0, 0], 1);
    state.chars = ['', 'changyueyue'];
    // effects 为空（已到期）
    const dispatcher = createDispatcher(['', 'changyueyue']);
    const hooks = dispatcher.buildHooks(state, 1);
    const r = applyMove(state, 6, 1, hooks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.captured).toBe(true);
    expect(r.state.stores[1]).toBe(6); // take=5 + 末子1
    expect(r.state.board[4]).toBe(0);
  });
});

// ==================== 7. 昔涟悔棋 ====================

describe('7. xilian-rewind：昔涟 snapshot 恢复 + 二次无快照', () => {
  it('onTurnStart 设 snapshot；active 恢复到 snapshot', () => {
    const s0 = createInitialState();
    s0.chars = ['xilian', ''];
    const dispatcher = createDispatcher(['xilian', '']);
    const s1 = dispatcher.onTurnStart(s0, 0);
    expect(s1.snapshot).toBeDefined();
    expect(s1.snapshot!.board).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);

    // 玩家0 落子改 board（不传 hooks，纯落子）
    const r = applyMove(s1, 0, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s2 = r.state;
    expect(s2.board[0]).toBe(0); // 播种取走

    // 昔涟 active 恢复到 snapshot
    const ctx = makeCtx(s2, 0);
    const rewind = xilian.active!(ctx, 0);
    expect(rewind.board[0]).toBe(4); // 恢复
    expect(rewind.stores).toEqual([0, 0]);
    expect(rewind.skillRefunded).toBe(true);
    expect(rewind.message).toBe('昔涟·时间回溯');
  });

  it('二次调用无 snapshot → 返回"无快照可悔"且不变', () => {
    const s0 = createInitialState();
    s0.chars = ['xilian', ''];
    const r = applyMove(s0, 0, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s2 = { ...r.state, snapshot: undefined };
    const ctx = makeCtx(s2, 0);
    const rewind = xilian.active!(ctx, 0);
    expect(rewind.message).toBe('昔涟：无快照可悔');
    expect(rewind.board).toEqual(s2.board);
    expect(rewind.skillRefunded).toBeUndefined();
  });
});

// ==================== 8. 缇宝传送不消耗本回合 + cw/ccw ====================

describe('8. tibao-transport：传送+播种 + continueAfterSkill', () => {
  it('ccw 方向：传送 board[0]=2 到 board[5] 再从 logical=5 播种', () => {
    const state = makeState([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0], 0);
    state.chars = ['tibao', ''];
    const ctx = makeCtx(state, 0);
    const r = tibao.active!(ctx, 0, 5, 'ccw');
    // board[5] += 2 → 2；board[0]=0；sowSeeds 2 颗 from logical=5 ccw:
    // 6(store0 +1), 7(board[6]+=1)
    expect(r.continueAfterSkill).toBe(true);
    expect(r.board[0]).toBe(0); // 传送后清空
    expect(r.board[5]).toBe(0); // 播种取走2颗
    expect(r.stores[0]).toBe(1); // 1 颗进 store0
    expect(r.board[6]).toBe(1); // 1 颗落 P1 坑1 (logical=7)
    expect(r.extraTurn).toBe(false);
  });

  it('cw 方向：sowPath 递减（logical=5 → 4 → 3）', () => {
    const state = makeState([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0], 0);
    state.chars = ['tibao', ''];
    const ctx = makeCtx(state, 0);
    const r = tibao.active!(ctx, 0, 5, 'cw');
    // 2 颗 from logical=5 cw: 4(board[4]+=1), 3(board[3]+=1)
    expect(r.board[4]).toBe(1);
    expect(r.board[3]).toBe(1);
    expect(r.continueAfterSkill).toBe(true);
    expect(r.extraTurn).toBe(false);
  });
});

// ==================== 9. 赛飞儿减半 ====================

describe('9. saifeier-halve：n=1/2/3/10 各情况', () => {
  const cases = [
    { n: 1, taken: 0, leave: 1 },
    { n: 2, taken: 1, leave: 1 },
    { n: 3, taken: 1, leave: 2 },
    { n: 10, taken: 5, leave: 5 },
  ];
  for (const { n, taken, leave } of cases) {
    it(`n=${n} → taken=${taken}, leave=${leave}`, () => {
      const board = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      board[0] = n;
      const state = makeState(board, [0, 0], 1);
      state.chars = ['', 'saifeier'];
      const ctx = makeCtx(state, 1);
      const r = saifeier.active!(ctx, 0, 0, 'ccw');
      expect(r.board[0]).toBe(leave);
      expect(r.stores[1]).toBe(taken);
    });
  }
});

// ==================== 10. 联机盲选消息不含角色 id ====================

describe('10. online-blindselect：CHAR_CONFIRM 不含角色 id', () => {
  it('CHAR_CONFIRM 通过结构校验且 payload 无角色 id', () => {
    // guest 选 baie，构造 CHAR_CONFIRM（payload 只有 {confirmed:true}）
    const guestConfirm = buildMessage(
      'CHAR_CONFIRM',
      { confirmed: true },
      0,
      GUEST,
    );
    expect(validateMessageStructure(guestConfirm).ok).toBe(true);
    // payload 不含角色 id
    expect(JSON.stringify(guestConfirm.payload)).not.toContain('baie');
  });

  it('双方都发 CHAR_CONFIRM 后 host 构造 CHAR_REVEAL{chars} 广播', () => {
    const guestConfirm = buildMessage(
      'CHAR_CONFIRM',
      { confirmed: true },
      0,
      GUEST,
    );
    const hostConfirm = buildMessage(
      'CHAR_CONFIRM',
      { confirmed: true },
      0,
      REMOTE,
    );
    expect(validateMessageStructure(guestConfirm).ok).toBe(true);
    expect(validateMessageStructure(hostConfirm).ok).toBe(true);

    // CHAR_REVEAL 才暴露双方角色
    const reveal = buildMessage(
      'CHAR_REVEAL',
      { chars: ['wandi', 'baie'] },
      0,
      REMOTE,
    );
    expect(validateMessageStructure(reveal).ok).toBe(true);
  });

  it('CHAR_REVEAL 前 guest 仅见 hostConfirm，无法得知 host 角色', () => {
    // host 选 wandi，但 hostConfirm.payload 只有 {confirmed:true}
    const hostConfirm = buildMessage(
      'CHAR_CONFIRM',
      { confirmed: true },
      0,
      REMOTE,
    );
    expect(JSON.stringify(hostConfirm.payload)).not.toContain('wandi');
    expect(JSON.stringify(hostConfirm.payload)).not.toContain('baie');
  });
});
