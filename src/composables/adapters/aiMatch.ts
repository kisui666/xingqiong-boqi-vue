/**
 * AiMatchAdapter —— 人机对战模式
 * 人执 0（先手），AI 执 1。bottomPlayer 固定 0（人在下）。
 * AI 在 onAfterCommit 钩子里 setTimeout(600ms) 触发，复用同一套动画。
 */
import { computed, ref } from 'vue';
import {
  applyMove,
  createInitialState,
  getLegalPits,
  getSowPath,
  toViewBoard,
} from '../../game/engine';
import {
  PITS,
  isStoreLogical,
  logicalToBoardPit,
} from '../../game/constants';
import { chooseMove } from '../../game/ai';
import type { AiContext, AiDifficulty } from '../../game/ai';
import type {
  Board,
  Effect,
  GameState,
  MoveErrorCode,
  PlayerId,
} from '../../game/types';
import type { P2PStatus } from '../../p2p/useP2PGame';
import { useMoveAnimation } from '../useMoveAnimation';
import type { MatchAdapter } from './types';

export function createAiMatch(
  getBoardEl: () => HTMLElement | null,
  difficulty: AiDifficulty,
): MatchAdapter {
  const aiPlayer: PlayerId = 1;
  const humanPlayer: PlayerId = 0;
  const aiCtx: AiContext = { aiPlayer, difficulty };

  const state = ref<GameState>(createInitialState());
  const displayBoard = ref<Board>(toViewBoard(state.value));
  const extraTurnActive = ref(false);
  const lastError = ref<MoveErrorCode | null>(null);

  const { animating, playMove, kill } = useMoveAnimation(getBoardEl);

  const bottomPlayer = computed<PlayerId>(() => 0);
  const controllablePlayers = computed<PlayerId[]>(() => [0]);
  const p2pStatus = computed<P2PStatus>(() => 'connected');

  // ---------- Step 2 技能字段 stub（Step 3 PvE 再增强） ----------
  // PvE：玩家可选角色；AI 侧固定 ''（不挂 Character 实例，避免误触发被动）
  const chars = computed<[string, string]>(() => state.value.chars);
  const skillUsed = computed<[boolean, boolean]>(() => state.value.skillUsed);
  const activeEffects = computed<Effect[]>(() => state.value.effects);
  const pendingTibao = computed(() => false);
  const activeHint = computed<number | undefined>(() => undefined);
  const silenced = computed<PlayerId[]>(() => []);
  const direction = computed<'cw' | 'ccw' | undefined>(
    () => state.value.direction,
  );

  let aiTimer: number | undefined;

  // pitIndex 是 14 位逻辑索引；转 board 下标后校验
  function canClick(pitIndex: number): boolean {
    if (animating.value) return false;
    const s = state.value;
    if (s.finished || s.currentPlayer !== humanPlayer) return false;
    if (isStoreLogical(pitIndex)) return false;
    const bIdx = logicalToBoardPit(pitIndex);
    if (!PITS[humanPlayer].includes(bIdx)) return false;
    return s.board[bIdx] > 0;
  }

  function handlePitClick(pitIndex: number) {
    if (!canClick(pitIndex)) return;
    const bIdx = logicalToBoardPit(pitIndex);
    const before = state.value;
    const result = applyMove(before, bIdx, humanPlayer);
    if (!result.ok) return;

    extraTurnActive.value = result.extraTurn;
    playMove(displayBoard, before, result, humanPlayer, {
      onCommit: (res) => {
        state.value = res.state;
      },
      onAfterCommit: () => {
        scheduleAiTurn();
      },
    });
  }

  function scheduleAiTurn() {
    if (aiTimer) window.clearTimeout(aiTimer);
    const s = state.value;
    if (s.finished || s.currentPlayer !== aiPlayer) return;
    aiTimer = window.setTimeout(() => {
      runAiTurn();
    }, 600);
  }

  function runAiTurn() {
    const before = state.value;
    if (before.finished || before.currentPlayer !== aiPlayer) return;
    const legal = getLegalPits(before);
    if (legal.length === 0) return;

    const pitIndex = chooseMove(before, aiCtx);
    if (pitIndex === null) return;

    // AI 选的是 board 下标，直接 applyMove
    const result = applyMove(before, pitIndex, aiPlayer);
    if (!result.ok) return;

    extraTurnActive.value = result.extraTurn;
    playMove(displayBoard, before, result, aiPlayer, {
      onCommit: (res) => {
        state.value = res.state;
      },
      onAfterCommit: () => {
        scheduleAiTurn();
      },
    });
  }

  function reset() {
    kill();
    if (aiTimer) window.clearTimeout(aiTimer);
    state.value = createInitialState();
    displayBoard.value = toViewBoard(state.value);
    extraTurnActive.value = false;
    lastError.value = null;
  }

  function destroy() {
    kill();
    if (aiTimer) window.clearTimeout(aiTimer);
  }

  // ---------- Step 2 技能方法 stub ----------
  function setChars(newChars: [string, string]) {
    // PvE：玩家角色写入 [0]，AI 侧强制 ''
    state.value = {
      ...state.value,
      chars: [newChars[0], ''],
    };
  }
  function setDirection(_dir: 'cw' | 'ccw') {
    // Step 3 实现
  }
  function canUseSkill(_player: PlayerId): boolean {
    return false; // Step 3 实现
  }
  function useSkill(
    _skillId: string,
    _pit?: number,
    _targetPit?: number,
    _direction?: 'cw' | 'ccw',
  ): boolean {
    return false; // Step 3 实现
  }
  function previewSowPath(pitIndex: number, dir?: 'cw' | 'ccw'): number[] {
    const s = state.value;
    return getSowPath(s.board, s.stores, pitIndex, dir ?? s.direction ?? 'ccw');
  }
  function getSkillHint(_player: PlayerId): number | undefined {
    return undefined;
  }

  return {
    mode: 'ai',
    state,
    displayBoard,
    animating,
    bottomPlayer,
    controllablePlayers,
    extraTurnActive,
    lastError,
    p2pStatus,
    canClick,
    handlePitClick,
    reset,
    destroy,
    // Step 2 技能系统 stub
    chars,
    skillUsed,
    activeEffects,
    pendingTibao,
    activeHint,
    silenced,
    direction,
    setChars,
    setDirection,
    canUseSkill,
    useSkill,
    previewSowPath,
    getSkillHint,
  };
}
