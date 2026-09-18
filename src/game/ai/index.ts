/**
 * AI 模块入口 —— 三种模式的适配器共用此接口选择落子。
 * 纯函数，不依赖 Vue / DOM / GSAP，可在 Node 跑单测，后续可搬进 Web Worker。
 */
import { getLegalPits } from '../engine';
import { pickEasy, pickHard, pickMedium } from './strategies';
import type { GameState, PlayerId } from '../types';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface AiContext {
  /** AI 在权威模型里的玩家编号（通常 1） */
  aiPlayer: PlayerId;
  /** 难度 */
  difficulty: AiDifficulty;
}

/**
 * 选择 AI 本手的落子坑位。
 * @returns 合法坑位索引；若 state 已终局或无合法坑位返回 null
 */
export function chooseMove(state: GameState, ctx: AiContext): number | null {
  if (state.finished) return null;
  const legal = getLegalPits(state);
  if (legal.length === 0) return null;

  switch (ctx.difficulty) {
    case 'easy':
      return pickEasy(state, ctx.aiPlayer, legal);
    case 'medium':
      return pickMedium(state, ctx.aiPlayer, legal);
    case 'hard':
      return pickHard(state, ctx.aiPlayer, legal);
  }
}
