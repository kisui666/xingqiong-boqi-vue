/**
 * 角色数据层（V0.3 Step 1）
 * ==================================================================
 * 13 个角色，每个 export 一个 Character 对象。强度按 spec 锁定，
 * 不得改强弱。主动技能通过 ctx 提供的引擎纯函数（sowSeeds /
 * captureStones / applyMove）完成棋盘结算，返回 ActionResult。
 *
 * 主动技能播种不传 SowHooks（被动不触发）；普通落子才由
 * dispatcher.buildHooks 整合被动。
 */
import { getLegalPits } from '../game/engine';
import { PITS, opponent } from '../game/constants';
import type { Character, ActiveContext, ActionResult } from './types';
import type { Effect, PlayerId } from '../game/types';

// ==================== 白厄 baie ====================
export const baie: Character = {
  id: 'baie',
  name: '白厄',
  passiveDesc: '棋子落入己方计分坑且己方分数不高于对方时，额外+1分',
  activeName: '翻倍播种',
  activeDesc: '选己方坑，将该坑棋子翻倍（上限12）后正常播种',
  active(ctx: ActiveContext, pit: number): ActionResult {
    const { state, player, sowSeeds } = ctx;
    const board = state.board.slice();
    const stores: [number, number] = [state.stores[0], state.stores[1]];
    const n = board[pit];
    const doubled = Math.min(n * 2, 12);
    board[pit] = doubled;
    // 主动播种不传 hooks（被动不触发）
    const result = sowSeeds(board, stores, pit, player, 'ccw');
    return {
      board: result.board,
      stores: result.stores,
      extraTurn: result.lastInStore,
      message: '白厄·翻倍播种',
    };
  },
};

// ==================== 万敌 wandi ====================
export const wandi: Character = {
  id: 'wandi',
  name: '万敌',
  passiveDesc: '每次捕获完成后，己方计分坑额外+1',
  activeName: '半入仓半播种',
  activeDesc: '选己方坑，一半棋子入仓，一半正常播种',
  active(ctx: ActiveContext, pit: number): ActionResult {
    const { state, player, sowSeeds, captureStones } = ctx;
    const board = state.board.slice();
    const stores: [number, number] = [state.stores[0], state.stores[1]];
    const n = board[pit];
    const storeAdd = Math.floor(n / 2);
    const sowStones = n - storeAdd;
    board[pit] = 0;
    stores[player] += storeAdd;
    board[pit] = sowStones;
    // 主动播种/捕获不传 hooks
    const sow = sowSeeds(board, stores, pit, player, 'ccw');
    const cap = captureStones(sow.board, sow.stores, sow.lastIndex, player);
    return {
      board: cap.board,
      stores: cap.stores,
      extraTurn: cap.captured,
      message: '万敌·半入仓半播种',
    };
  },
};

// ==================== 阿格莱雅 aglaiya ====================
export const aglaiya: Character = {
  id: 'aglaiya',
  name: '阿格莱雅',
  passiveDesc: '己方空坑被对手播种填满时，额外+2分',
  activeName: '坑位交换',
  activeDesc: '选己方两坑，交换棋子数',
  active(ctx: ActiveContext, pit: number, targetPit?: number): ActionResult {
    const board = ctx.state.board.slice();
    const stores: [number, number] = [ctx.state.stores[0], ctx.state.stores[1]];
    if (targetPit !== undefined) {
      const tmp = board[pit];
      board[pit] = board[targetPit];
      board[targetPit] = tmp;
    }
    return {
      board,
      stores,
      extraTurn: false,
      message: '阿格莱雅·坑位交换',
    };
  },
};

// ==================== 缇宝 tibao ====================
export const tibao: Character = {
  id: 'tibao',
  name: '缇宝',
  passiveDesc: '每回合首次落子可自选方向',
  activeName: '传送播种',
  activeDesc: '将己方一坑种子传送到同侧另一坑，然后从该坑起正常播种',
  active(ctx: ActiveContext, pit: number, targetPit?: number, direction?: 'cw' | 'ccw'): ActionResult {
    const { state, player, sowSeeds } = ctx;
    const board = state.board.slice();
    const stores: [number, number] = [state.stores[0], state.stores[1]];
    const startPit = targetPit ?? pit;
    if (targetPit !== undefined) {
      board[targetPit] += board[pit];
      board[pit] = 0;
    }
    const dir = direction ?? 'ccw';
    const result = sowSeeds(board, stores, startPit, player, dir);
    return {
      board: result.board,
      stores: result.stores,
      extraTurn: result.lastInStore,
      continueAfterSkill: true,
      message: '缇宝·传送播种',
    };
  },
};

// ==================== 遐蝶 xiadie ====================
export const xiadie: Character = {
  id: 'xiadie',
  name: '遐蝶',
  passiveDesc: '被捕获时至少保留1颗棋子',
  activeName: '死荫之触',
  activeDesc: '选对手一非空坑，取其一半（向上取整）入己方计分坑',
  active(ctx: ActiveContext, _pit: number, targetPit?: number): ActionResult {
    const board = ctx.state.board.slice();
    const stores: [number, number] = [ctx.state.stores[0], ctx.state.stores[1]];
    if (targetPit === undefined) {
      return { board, stores, extraTurn: false, message: '遐蝶·死荫之触（未指定目标）' };
    }
    const n = board[targetPit];
    const take = Math.ceil(n / 2);
    stores[ctx.player] += take;
    board[targetPit] = n - take;
    return {
      board,
      stores,
      extraTurn: false,
      message: '遐蝶·死荫之触',
    };
  },
};

// ==================== 那刻夏 nakkari ====================
export const nakkari: Character = {
  id: 'nakkari',
  name: '那刻夏',
  passiveDesc: '始终可见所有坑数字；沉默阿格莱雅（对手若为阿格莱雅，其被动+主动均失效）',
  activeName: '洞察',
  activeDesc: '高亮期望净得分最高的落点（纯提示）',
  active(ctx: ActiveContext, _pit: number, _targetPit?: number): ActionResult {
    const { state, player, applyMove } = ctx;
    // 用 player 作为 currentPlayer 临时构造一份状态来跑 getLegalPits
    const probeState = { ...state, currentPlayer: player };
    const legal = getLegalPits(probeState);
    let bestPit: number | undefined;
    let bestGain = -Infinity;
    for (const p of legal) {
      const r = applyMove(state, p, player);
      if (!r.ok) continue;
      const gain = r.state.stores[player] - state.stores[player];
      if (gain > bestGain) {
        bestGain = gain;
        bestPit = p;
      }
    }
    return {
      board: state.board.slice(),
      stores: [state.stores[0], state.stores[1]],
      extraTurn: false,
      hintPit: bestPit,
      message: '那刻夏·洞察',
    };
  },
};

// ==================== 风堇 fengqin ====================
export const fengqin: Character = {
  id: 'fengqin',
  name: '风堇',
  passiveDesc: '回合开始时若有己方空坑且己方计分坑有棋子，从计分坑取1填入最左空坑',
  passive(ctx, event) {
    if (event.type !== 'turnStart') return;
    const { state, player } = ctx;
    if (state.chars[player] !== 'fengqin') return;
    const emptyPits = PITS[player].filter((p) => state.board[p] === 0);
    if (emptyPits.length === 0 || state.stores[player] <= 0) return;
    const leftmost = emptyPits[0];
    state.board[leftmost] += 1;
    state.stores[player] -= 1;
  },
  activeName: '虹光缝补',
  activeDesc: '选己方坑，从计分坑取棋子补至6颗（上限）',
  active(ctx: ActiveContext, _pit: number, targetPit?: number): ActionResult {
    const board = ctx.state.board.slice();
    const stores: [number, number] = [ctx.state.stores[0], ctx.state.stores[1]];
    if (targetPit === undefined) {
      return { board, stores, extraTurn: false, message: '风堇·虹光缝补（未指定目标）' };
    }
    const need = Math.max(0, 6 - board[targetPit]);
    const add = Math.min(need, stores[ctx.player]);
    board[targetPit] += add;
    stores[ctx.player] -= add;
    return {
      board,
      stores,
      extraTurn: false,
      message: '风堇·虹光缝补',
    };
  },
};

// ==================== 赛飞儿 saifeier ====================
export const saifeier: Character = {
  id: 'saifeier',
  name: '赛飞儿',
  passiveDesc: '无被动',
  activeName: '减半',
  activeDesc: '选对手一非空坑，取其一半（向下取整，至少留1）入己方计分坑',
  active(ctx: ActiveContext, _pit: number, targetPit?: number): ActionResult {
    const board = ctx.state.board.slice();
    const stores: [number, number] = [ctx.state.stores[0], ctx.state.stores[1]];
    if (targetPit === undefined) {
      return { board, stores, extraTurn: false, message: '赛飞儿·减半（未指定目标）' };
    }
    const n = board[targetPit];
    const taken = Math.min(Math.floor(n / 2), n - 1);
    stores[ctx.player] += taken;
    board[targetPit] = n - taken;
    return {
      board,
      stores,
      extraTurn: false,
      message: '赛飞儿·减半',
    };
  },
};

// ==================== 海瑟音 haiseyin ====================
export const haiseyin: Character = {
  id: 'haiseyin',
  name: '海瑟音',
  passiveDesc: '无被动',
  activeName: '重分配',
  activeDesc: '选一方整行，将棋子总数平均分配到6坑（前 rem 坑+1）',
  active(ctx: ActiveContext, _pit: number, targetPit?: number): ActionResult {
    const board = ctx.state.board.slice();
    const stores: [number, number] = [ctx.state.stores[0], ctx.state.stores[1]];
    // targetPit 解释为行号 0 或 1；其他值默认按 boardPitOwner 推断
    let row: PlayerId;
    if (targetPit === 0 || targetPit === 1) row = targetPit;
    else if (targetPit !== undefined && targetPit >= 6) row = 1;
    else row = 0;
    const pits = PITS[row];
    const total = pits.reduce((s, p) => s + board[p], 0);
    const base = Math.floor(total / 6);
    const rem = total % 6;
    pits.forEach((p, i) => {
      board[p] = base + (i < rem ? 1 : 0);
    });
    return {
      board,
      stores,
      extraTurn: false,
      message: '海瑟音·重分配',
    };
  },
};

// ==================== 刻律德菈 kelvdelu ====================
export const kelvdelu: Character = {
  id: 'kelvdelu',
  name: '刻律德菈',
  passiveDesc: '无被动',
  activeName: '裁决',
  activeDesc: '立即获得额外一回合',
  active(ctx: ActiveContext): ActionResult {
    return {
      board: ctx.state.board.slice(),
      stores: [ctx.state.stores[0], ctx.state.stores[1]],
      extraTurn: true,
      message: '刻律德菈·裁决',
    };
  },
};

// ==================== 长夜月 changyueyue ====================
export const changyueyue: Character = {
  id: 'changyueyue',
  name: '长夜月',
  passiveDesc: '无被动',
  activeName: '遗忘',
  activeDesc: '给对手一坑贴遗忘效果3回合（不可被捕获）',
  active(ctx: ActiveContext, _pit: number, targetPit?: number): ActionResult {
    const opp: PlayerId = opponent(ctx.player);
    const effects: Effect[] = ctx.state.effects.map((e) => ({ ...e }));
    if (targetPit !== undefined) {
      effects.push({
        type: 'forget',
        owner: opp,
        pit: targetPit,
        remainTurns: 3,
      });
    }
    return {
      board: ctx.state.board.slice(),
      stores: [ctx.state.stores[0], ctx.state.stores[1]],
      extraTurn: false,
      effects,
      message: '长夜月·遗忘',
    };
  },
};

// ==================== 丹恒·腾荒 danheng ====================
export const danheng: Character = {
  id: 'danheng',
  name: '丹恒·腾荒',
  passiveDesc: '被捕获时若该坑≥6颗，免疫捕获',
  activeName: '固化',
  activeDesc: '给己方一坑贴固化效果3回合（不可被捕获）',
  active(ctx: ActiveContext, _pit: number, targetPit?: number): ActionResult {
    const effects: Effect[] = ctx.state.effects.map((e) => ({ ...e }));
    if (targetPit !== undefined) {
      effects.push({
        type: 'solid',
        owner: ctx.player,
        pit: targetPit,
        remainTurns: 3,
      });
    }
    return {
      board: ctx.state.board.slice(),
      stores: [ctx.state.stores[0], ctx.state.stores[1]],
      extraTurn: false,
      effects,
      message: '丹恒·固化',
    };
  },
};

// ==================== 昔涟 xilian ====================
export const xilian: Character = {
  id: 'xilian',
  name: '昔涟',
  passiveDesc: '无被动',
  activeName: '时间回溯',
  activeDesc: '恢复到上一回合开始时的状态快照',
  active(ctx: ActiveContext): ActionResult {
    const { state, player } = ctx;
    if (!state.snapshot) {
      return {
        board: state.board.slice(),
        stores: [state.stores[0], state.stores[1]],
        extraTurn: false,
        message: '昔涟：无快照可悔',
      };
    }
    const snap = state.snapshot;
    const board = snap.board.slice();
    const stores: [number, number] = [snap.stores[0], snap.stores[1]];
    const effects: Effect[] = snap.effects.map((e) => ({ ...e }));
    const skillUsed: [boolean, boolean] = [
      snap.skillUsed[0],
      snap.skillUsed[1],
    ];
    skillUsed[player] = true;
    // 通过 effects/skillRefunded 信号告诉 dispatcher：需写回 currentPlayer/turn/清 snapshot
    // board/stores/effects 是快照内容；skillUsed 由调用方写回
    return {
      board,
      stores,
      extraTurn: false,
      effects,
      skillRefunded: true,
      message: '昔涟·时间回溯',
    };
  },
};
