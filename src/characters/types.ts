/**
 * 角色技能系统类型定义（V0.3 Step 1）
 * ==================================================================
 * 与 game/types.ts 的 SowHooks / Effect / GameState 共享底层契约。
 * Character 描述角色身份、被动描述与主动技能入口。
 */
import type { Effect, GameState, PlayerId } from '../game/types';

/** 主动技能结算结果：角色 active() 返回的结构 */
export interface ActionResult {
  /** 结算后 12 元素 board */
  board: number[];
  /** 结算后计分坑 */
  stores: [number, number];
  /** 是否追加一回合（刻律德菈/万敌捕获/白厄额外回合链等） */
  extraTurn: boolean;
  /** 战报文案 */
  message: string;
  /** 缇宝：传送后仍需落子，不消耗本回合行动 */
  continueAfterSkill?: boolean;
  /** 新增/更新效果（长夜月/丹恒） */
  effects?: Effect[];
  /** 丹恒固化期间被自己清空 → 返还技能次数 */
  skillRefunded?: boolean;
  /** 那刻夏：高亮落点（纯提示，不改棋盘） */
  hintPit?: number;
}

/** 被动上下文：事件触发时由 dispatcher 注入 */
export interface PassiveContext {
  state: GameState;
  /** 被动所属玩家 */
  player: PlayerId;
}

/** 主动上下文：active() 调用时由 dispatcher 注入 */
export interface ActiveContext {
  state: GameState;
  /** 发动者 */
  player: PlayerId;
  /** 复用引擎纯函数 */
  sowSeeds: typeof import('../game/engine').sowSeeds;
  captureStones: typeof import('../game/engine').captureStones;
  applyMove: typeof import('../game/engine').applyMove;
}

/** 角色被动可订阅的游戏事件 */
export type GameEvent =
  | { type: 'turnStart'; player: PlayerId }
  | { type: 'seedDropped'; logical: number; isStore: boolean; owner: PlayerId }
  | { type: 'pitFilled'; logical: number; owner: PlayerId }
  | { type: 'seedIntoStore'; storeOwner: PlayerId }
  | { type: 'captured'; oppositeBoardIdx: number; stones: number; owner: PlayerId };

/** 角色描述与回调集合 */
export interface Character {
  id: string;
  name: string;
  passiveDesc: string;
  activeName?: string;
  activeDesc?: string;
  /** 被动事件回调（订阅式） */
  passive?: (ctx: PassiveContext, event: GameEvent) => void;
  /** 主动技能入口 */
  active?: (
    ctx: ActiveContext,
    pit: number,
    targetPit?: number,
    direction?: 'cw' | 'ccw',
  ) => ActionResult;
}
