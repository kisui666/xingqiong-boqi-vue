/**
 * AiMatchAdapter —— 人机对战模式
 * 人执 0（先手），AI 执 1。bottomPlayer 固定 0（人在下）。
 * AI 在 onAfterCommit 钩子里 setTimeout(600ms) 触发，复用同一套动画。
 */
import { computed, ref } from 'vue';
import { applyMove, createInitialState, getLegalPits } from '../../game/engine';
import { PITS, isStore } from '../../game/constants';
import { chooseMove } from '../../game/ai';
import type { AiContext, AiDifficulty } from '../../game/ai';
import type { Board, GameState, MoveErrorCode, PlayerId } from '../../game/types';
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
  const displayBoard = ref<Board>(state.value.board.slice());
  const extraTurnActive = ref(false);
  const lastError = ref<MoveErrorCode | null>(null);

  const { animating, playMove, kill } = useMoveAnimation(getBoardEl);

  const bottomPlayer = computed<PlayerId>(() => 0);
  const controllablePlayers = computed<PlayerId[]>(() => [0]);
  const p2pStatus = computed<P2PStatus>(() => 'connected');

  let aiTimer: number | undefined;

  function canClick(pitIndex: number): boolean {
    if (animating.value) return false;
    const s = state.value;
    if (s.finished || s.currentPlayer !== humanPlayer) return false;
    if (isStore(pitIndex) || !PITS[humanPlayer].includes(pitIndex)) return false;
    return s.board[pitIndex] > 0;
  }

  function handlePitClick(pitIndex: number) {
    if (!canClick(pitIndex)) return;
    const before = state.value;
    const result = applyMove(before, pitIndex, humanPlayer);
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
    displayBoard.value = state.value.board.slice();
    extraTurnActive.value = false;
    lastError.value = null;
  }

  function destroy() {
    kill();
    if (aiTimer) window.clearTimeout(aiTimer);
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
  };
}
