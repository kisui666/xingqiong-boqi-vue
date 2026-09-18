/**
 * LocalMatchAdapter —— 本地双人同屏模式
 * 双方轮流点击同一设备，无网络，无 AI。
 * bottomPlayer 固定 0（不翻转视角，靠高亮区分当前玩家）。
 */
import { computed, ref } from 'vue';
import { applyMove, createInitialState } from '../../game/engine';
import { PITS, isStore } from '../../game/constants';
import type { Board, GameState, MoveErrorCode, PlayerId } from '../../game/types';
import type { P2PStatus } from '../../p2p/useP2PGame';
import { useMoveAnimation } from '../useMoveAnimation';
import type { MatchAdapter } from './types';

export function createLocalMatch(
  getBoardEl: () => HTMLElement | null,
): MatchAdapter {
  const state = ref<GameState>(createInitialState());
  const displayBoard = ref<Board>(state.value.board.slice());
  const extraTurnActive = ref(false);
  const lastError = ref<MoveErrorCode | null>(null);

  const { animating, playMove, kill } = useMoveAnimation(getBoardEl);

  const bottomPlayer = computed<PlayerId>(() => 0);
  const controllablePlayers = computed<PlayerId[]>(() => [0, 1]);
  const p2pStatus = computed<P2PStatus>(() => 'connected');

  function canClick(pitIndex: number): boolean {
    if (animating.value) return false;
    const s = state.value;
    if (s.finished) return false;
    const cp = s.currentPlayer;
    if (isStore(pitIndex) || !PITS[cp].includes(pitIndex)) return false;
    return s.board[pitIndex] > 0;
  }

  function handlePitClick(pitIndex: number) {
    if (!canClick(pitIndex)) return;
    const before = state.value;
    const result = applyMove(before, pitIndex, before.currentPlayer);
    if (!result.ok) return;

    extraTurnActive.value = result.extraTurn;
    playMove(displayBoard, before, result, before.currentPlayer, {
      onCommit: (res) => {
        state.value = res.state;
      },
    });
  }

  function reset() {
    kill();
    state.value = createInitialState();
    displayBoard.value = state.value.board.slice();
    extraTurnActive.value = false;
    lastError.value = null;
  }

  function destroy() {
    kill();
  }

  return {
    mode: 'local',
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
