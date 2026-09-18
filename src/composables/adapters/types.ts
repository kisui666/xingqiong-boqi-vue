/**
 * MatchAdapter 接口 + 共享类型
 * 三种模式（Local / AI / Online）的适配器实现此接口，
 * useMatch facade 按 mode 切换，UI 只消费统一 API。
 */
import type { ComputedRef, Ref } from 'vue';
import type {
  Board,
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
}

export interface UseMatchOptions {
  getBoardEl: () => HTMLElement | null;
}
