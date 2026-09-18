/**
 * 角色 dispatcher（V0.3 Step 1）
 * ==================================================================
 * 由 chars 双方角色构造。提供两个入口：
 *   - buildHooks(state, byPlayer)：构造 SowHooks 整合被动加分逻辑
 *     （那刻夏沉默阿格莱雅在此拦截，不删 Character 对象）。
 *   - onTurnStart(state, player)：返回新 state（深拷贝后改），处理
 *     风堇被动 / 效果递减 / 昔涟快照 / 缇宝方向默认。
 *
 * 不调用 Character.passive 字段（dispatcher 内联加分逻辑）；
 * 字段保留供未来 UI 订阅事件。
 */
import { PITS, opponent } from '../game/constants';
import type { Effect, GameState, PlayerId, SowHooks } from '../game/types';

export interface Dispatcher {
  buildHooks: (state: GameState, byPlayer: PlayerId) => SowHooks;
  onTurnStart: (state: GameState, player: PlayerId) => GameState;
}

export function createDispatcher(_chars: [string, string]): Dispatcher {
  // chars 参数保留为 API 一致性；实际从 state.chars 读取
  void _chars;

  function buildHooks(state: GameState, byPlayer: PlayerId): SowHooks {
    // 局部跟踪 stores 变化（模拟 sowSeeds 内部 s 的最新值）
    // 仅用于 onSeedIntoStore 的白厄条件判断
    const curStores: [number, number] = [state.stores[0], state.stores[1]];

    return {
      onSowStep(_logical, _isStore, _owner) {
        // 记录型回调；Step1 不订阅
      },
      onPitFilled(_logical, owner) {
        // 阿格莱雅被动：被对手播种填满（owner≠byPlayer）且对手非那刻夏
        if (
          state.chars[owner] === 'aglaiya' &&
          owner !== byPlayer &&
          state.chars[opponent(owner)] !== 'nakkari'
        ) {
          return 2;
        }
        return 0;
      },
      onSeedIntoStore(storeOwner) {
        // 本次投放先入账，再判断白厄条件
        curStores[storeOwner] += 1;
        if (
          state.chars[storeOwner] === 'baie' &&
          curStores[storeOwner] <= curStores[opponent(storeOwner)]
        ) {
          return 1;
        }
        return 0;
      },
      onCapture(oppositeBoardIdx, stones, owner) {
        // 1) 效果优先：forget / solid → 免捕获
        const eff: Effect | undefined = state.effects.find(
          (e) =>
            e.owner === owner &&
            e.pit === oppositeBoardIdx &&
            (e.type === 'forget' || e.type === 'solid'),
        );
        if (eff) {
          return { take: 0, leave: stones };
        }
        // 2) 丹恒 ≥6 免捕获
        if (state.chars[owner] === 'danheng' && stones >= 6) {
          return { take: 0, leave: stones };
        }
        // 3) 遐蝶保底留1
        if (state.chars[owner] === 'xiadie') {
          return { take: Math.max(stones - 1, 0), leave: 1 };
        }
        // 4) 默认全取
        return { take: stones, leave: 0 };
      },
      onCaptureComplete(_captured, _fromOppositeBoardIdx) {
        // 万敌 +1
        if (state.chars[byPlayer] === 'wandi') {
          return 1;
        }
        return 0;
      },
    };
  }

  function onTurnStart(state: GameState, player: PlayerId): GameState {
    // 深拷贝（清 snapshot 防嵌套）
    const next: GameState = {
      board: state.board.slice(),
      stores: [state.stores[0], state.stores[1]],
      currentPlayer: player,
      turn: state.turn,
      finished: state.finished,
      winner: state.winner,
      chars: [state.chars[0], state.chars[1]],
      skillUsed: [state.skillUsed[0], state.skillUsed[1]],
      effects: state.effects.map((e) => ({ ...e })),
    };

    // 风堇被动：最左空坑+1，stores[player]-1
    if (next.chars[player] === 'fengqin') {
      const emptyPits = PITS[player].filter((p) => next.board[p] === 0);
      if (emptyPits.length > 0 && next.stores[player] > 0) {
        const leftmost = emptyPits[0];
        next.board[leftmost] += 1;
        next.stores[player] -= 1;
      }
    }

    // 效果递减：owner===player 的效果 remainTurns-1，<=0 移除
    next.effects = next.effects
      .map((e) =>
        e.owner === player ? { ...e, remainTurns: e.remainTurns - 1 } : e,
      )
      .filter((e) => e.remainTurns > 0);

    // 昔涟快照：本回合开始时的状态（清 snapshot 防嵌套）
    if (next.chars[player] === 'xilian') {
      next.snapshot = {
        board: next.board.slice(),
        stores: [next.stores[0], next.stores[1]],
        currentPlayer: next.currentPlayer,
        turn: next.turn,
        finished: next.finished,
        winner: next.winner,
        chars: [next.chars[0], next.chars[1]],
        skillUsed: [next.skillUsed[0], next.skillUsed[1]],
        effects: next.effects.map((e) => ({ ...e })),
      };
    }

    // 缇宝方向默认 ccw（UI 后续覆盖）
    if (next.chars[player] === 'tibao' && !next.direction) {
      next.direction = 'ccw';
    }

    return next;
  }

  return { buildHooks, onTurnStart };
}
