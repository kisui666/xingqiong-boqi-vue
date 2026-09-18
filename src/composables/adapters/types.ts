/**
 * MatchAdapter 接口 + 共享类型（V0.3 Step 2）
 * ==================================================================
 * 三种模式（Local / AI / Online）的适配器实现此接口，
 * useMatch facade 按 mode 切换，UI 只消费统一 API。
 *
 * Step 2 新增技能系统字段：chars / skillUsed / activeEffects /
 * pendingTibao / silenced / direction / setChars / setDirection /
 * canUseSkill / useSkill / previewSowPath / getSkillHint。
 * Local 模式完整实现；AI/Online 暂提供最小 stub（Step 3/4 再增强）。
 */
import type { ComputedRef, Ref } from 'vue';
import type {
  Board,
  Effect,
  GameState,
  MoveErrorCode,
  PlayerId,
} from '../../game/types';
import type { P2PStatus } from '../../p2p/useP2PGame';

export type MatchMode = 'local' | 'ai' | 'online';
export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface MatchAdapter {
  readonly mode: MatchMode;
  readonly state: Ref<GameState>;
  readonly displayBoard: Ref<Board>;
  readonly animating: Ref<boolean>;
  /** 当前操作方在屏幕"下方"的玩家编号（视角翻转用） */
  readonly bottomPlayer: ComputedRef<PlayerId>;
  /** 本机当前可操控的玩家集合 */
  readonly controllablePlayers: ComputedRef<PlayerId[]>;
  readonly extraTurnActive: Ref<boolean>;
  readonly lastError: Ref<MoveErrorCode | null>;
  readonly p2pStatus: ComputedRef<P2PStatus>;
  canClick: (pitIndex: number) => boolean;
  handlePitClick: (pitIndex: number) => void;
  reset: () => void;
  destroy: () => void;

  // —— Step 2 技能系统 ——
  /** 双方角色 id（'' = 未选）；AI 侧固定 '' */
  readonly chars: ComputedRef<[string, string]>;
  /** 每人主动技能是否已用过 */
  readonly skillUsed: ComputedRef<[boolean, boolean]>;
  /** 当前生效的贴坑效果 */
  readonly activeEffects: ComputedRef<Effect[]>;
  /** 缇宝中间态：传送后等待落子（此期间不得切回合/让对手操作） */
  readonly pendingTibao: Ref<boolean>;
  /** 那刻夏洞察当前高亮的推荐落点（board 下标；undefined = 无高亮） */
  readonly activeHint: Ref<number | undefined>;
  /** 被沉默的玩家集合（对手是那刻夏且自己是阿格莱雅） */
  readonly silenced: ComputedRef<PlayerId[]>;
  /** 缇宝本回合选择的方向（未选时 undefined；UI 高亮用） */
  readonly direction: ComputedRef<'cw' | 'ccw' | undefined>;
  /** 设置双方角色（选人完成后调用，开局前） */
  setChars: (chars: [string, string]) => void;
  /** 设置缇宝本回合方向（落子前调用） */
  setDirection: (dir: 'cw' | 'ccw') => void;
  /** 判断某玩家当前能否发动主动技能（未用/未沉默/轮到自己） */
  canUseSkill: (player: PlayerId) => boolean;
  /**
   * 发动主动技能。
   * @param skillId  角色 id（必须与 state.chars[player] 一致）
   * @param pit      主坑（board 下标；部分技能需要，如白厄选己方坑翻倍）
   * @param targetPit 目标坑（部分技能需要，如缇宝传送目标、长夜月贴遗忘的对手坑）
   * @param direction 缇宝方向
   * @returns 是否成功发动（失败原因：已用/被沉默/非法参数）
   */
  useSkill: (
    skillId: string,
    pit?: number,
    targetPit?: number,
    direction?: 'cw' | 'ccw',
  ) => boolean;
  /** 计算播种路径预览（供技能确认弹窗沙盘；pitIndex 为 board 下标） */
  previewSowPath: (pitIndex: number, direction?: 'cw' | 'ccw') => number[];
  /** 那刻夏洞察提示落点（board 下标；无提示返回 undefined） */
  getSkillHint: (player: PlayerId) => number | undefined;
}

export interface UseMatchOptions {
  getBoardEl: () => HTMLElement | null;
}
