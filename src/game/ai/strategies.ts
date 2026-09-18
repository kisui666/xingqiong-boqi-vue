/**
 * AI 策略实现 —— 纯函数，只依赖 engine + types
 * ==================================================================
 * easy：随机；medium：评分制（extraTurn 优先 + 捕获 + 防御）。
 * 后续 hard 可在此扩展 Minimax。
 */
import { applyMove, getLegalPits } from '../engine';
import { PITS, STORE, opponent, oppositePit } from '../constants';
import type { GameState, PlayerId } from '../types';

/** 随机选一个合法坑位 */
export function pickEasy(state: GameState, aiPlayer: PlayerId, legal: number[]): number {
  void state; void aiPlayer;
  return legal[Math.floor(Math.random() * legal.length)];
}

/**
 * medium 评分制策略：
 *   +1000  触发额外回合
 *   +50×N  捕获 N 颗对面棋子
 *   -800   此手让对手下回合能触发额外回合
 *   +1     己方计分坑增量（微调，避免同等条件随机抖动过大）
 * 同分取首个（确定性，便于测试）。
 */
export function pickMedium(state: GameState, aiPlayer: PlayerId, legal: number[]): number {
  const foe = opponent(aiPlayer);
  const ownStore = STORE[aiPlayer];

  let bestPit = legal[0];
  let bestScore = -Infinity;

  for (const pit of legal) {
    const result = applyMove(state, pit, aiPlayer);
    if (!result.ok) continue;

    let score = 0;

    // 额外回合最高优先
    if (result.extraTurn) score += 1000;

    // 捕获加分
    if (result.captured) {
      const opp = oppositePit(result.lastIndex);
      const capturedCount = state.board[opp] + 1; // 对面 + 末子
      score += 50 * capturedCount;
    }

    // 计分坑增量微调
    const storeGain = result.state.board[ownStore] - state.board[ownStore];
    score += storeGain;

    // 防御：此手后对手是否有合法坑能触发额外回合
    if (!result.state.finished && result.state.currentPlayer === foe) {
      const foeLegal = getLegalPits(result.state);
      for (const fPit of foeLegal) {
        const foeResult = applyMove(result.state, fPit, foe);
        if (foeResult.ok && foeResult.extraTurn) {
          score -= 800;
          break;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPit = pit;
    }
  }

  return bestPit;
}

/** V0.2 占位：hard 暂时 fallback 到 medium（后续接 Minimax） */
export function pickHard(state: GameState, aiPlayer: PlayerId, legal: number[]): number {
  return pickMedium(state, aiPlayer, legal);
}

// 仅消除未使用导入告警（PITS 在当前策略中保留用于未来扩展）
void PITS;
