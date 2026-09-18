/**
 * useMatch —— 编排层 facade（V0.2 三模式）
 * ==================================================================
 * 按 mode 切换 MatchAdapter，用 computed 代理所有响应式字段，
 * 对外暴露统一 API。切换模式时旧 adapter destroy()、新 adapter 接管。
 *
 * 三种模式共用同一套 engine 纯函数 + useMoveAnimation 动画。
 */
import { computed, ref, shallowRef } from 'vue';
import { createInitialState } from '../game/engine';
import { INITIAL_BOARD } from '../game/constants';
import type { GameState, MoveErrorCode, PlayerId } from '../game/types';
import type { P2PStatus } from '../p2p/useP2PGame';
import { createLocalMatch } from './adapters/localMatch';
import { createAiMatch } from './adapters/aiMatch';
import { createOnlineMatch } from './adapters/onlineMatch';
import type { AiDifficulty, MatchAdapter, MatchMode } from './adapters/types';

export interface UseMatchOptions {
  getBoardEl: () => HTMLElement | null;
}

export function useMatch(options: UseMatchOptions) {
  const mode = ref<MatchMode | null>(null);
  const adapter = shallowRef<MatchAdapter | null>(null);

  function startLocal() {
    adapter.value?.destroy();
    adapter.value = createLocalMatch(options.getBoardEl);
    mode.value = 'local';
  }

  function startAi(difficulty: AiDifficulty = 'medium') {
    adapter.value?.destroy();
    adapter.value = createAiMatch(options.getBoardEl, difficulty);
    mode.value = 'ai';
  }

  function startOnlineAsHost() {
    adapter.value?.destroy();
    adapter.value = createOnlineMatch(options.getBoardEl, 'host');
    mode.value = 'online';
  }

  function startOnlineAsGuest(room: string) {
    adapter.value?.destroy();
    adapter.value = createOnlineMatch(options.getBoardEl, 'guest', room);
    mode.value = 'online';
  }

  // ---------- computed 代理 ----------
  const state = computed<GameState>(
    () => adapter.value?.state.value ?? createInitialState(),
  );
  const displayBoard = computed(
    () => adapter.value?.displayBoard.value ?? INITIAL_BOARD.slice(),
  );
  const animating = computed(() => adapter.value?.animating.value ?? false);
  const bottomPlayer = computed<PlayerId>(
    () => adapter.value?.bottomPlayer.value ?? 0,
  );
  const controllablePlayers = computed<PlayerId[]>(
    () => adapter.value?.controllablePlayers.value ?? [],
  );
  const extraTurnActive = computed(
    () => adapter.value?.extraTurnActive.value ?? false,
  );
  const lastError = computed<MoveErrorCode | null>(
    () => adapter.value?.lastError.value ?? null,
  );
  const p2pStatus = computed<P2PStatus>(
    () => adapter.value?.p2pStatus.value ?? 'idle',
  );

  function canClick(i: number): boolean {
    return adapter.value?.canClick(i) ?? false;
  }
  function handlePitClick(i: number): void {
    adapter.value?.handlePitClick(i);
  }
  function reset(): void {
    adapter.value?.reset();
  }
  function destroy(): void {
    adapter.value?.destroy();
    adapter.value = null;
    mode.value = null;
  }

  // ---------- Online 专用透传 ----------
  type OnlineAdapter = MatchAdapter & {
    createdRoom: { value: string | null };
    error: { value: string | null };
    myRole: { value: 'host' | 'guest' | null };
    remotePeerId: { value: string | null };
    reconnect: () => void;
  };
  function asOnline(a: MatchAdapter | null): OnlineAdapter | null {
    return a && a.mode === 'online' ? (a as OnlineAdapter) : null;
  }

  const onlineStatus = computed(() => adapter.value?.p2pStatus.value ?? 'idle');
  const onlineError = computed(() => asOnline(adapter.value)?.error?.value ?? null);
  const onlineMyRole = computed(() => asOnline(adapter.value)?.myRole?.value ?? null);
  const onlineRemotePeerId = computed(
    () => asOnline(adapter.value)?.remotePeerId?.value ?? null,
  );
  const onlineCreatedRoom = computed(
    () => asOnline(adapter.value)?.createdRoom?.value ?? null,
  );

  function onlineReconnect(): void {
    asOnline(adapter.value)?.reconnect?.();
  }
  function onlineDisconnect(): void {
    destroy();
  }

  return {
    mode,
    startLocal,
    startAi,
    startOnlineAsHost,
    startOnlineAsGuest,
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
    // Online 专用
    online: {
      status: onlineStatus,
      error: onlineError,
      myRole: onlineMyRole,
      remotePeerId: onlineRemotePeerId,
      createdRoom: onlineCreatedRoom,
      reconnect: onlineReconnect,
      disconnect: onlineDisconnect,
    },
  };
}
