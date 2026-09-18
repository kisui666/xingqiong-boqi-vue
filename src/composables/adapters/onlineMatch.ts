/**
 * OnlineMatchAdapter —— 在线 P2P 联机模式
 * 搬运自原 useMatch 的 P2P 编排逻辑，动画改调 useMoveAnimation。
 * host 权威结算 + 双端乐观动画 + 断线重连。
 */
import { computed, ref } from 'vue';
import {
  applyMove,
  createInitialState,
  getSowPath,
  toViewBoard,
} from '../../game/engine';
import {
  PITS,
  isStoreLogical,
  logicalToBoardPit,
} from '../../game/constants';
import { useP2PGame } from '../../p2p/useP2PGame';
import { useMoveAnimation } from '../useMoveAnimation';
import type {
  Board,
  Effect,
  GameState,
  MoveErrorCode,
  MoveSuccess,
  PlayerId,
} from '../../game/types';
import type { MatchAdapter } from './types';

export function createOnlineMatch(
  getBoardEl: () => HTMLElement | null,
  role: 'host' | 'guest',
  room?: string,
): MatchAdapter {
  const state = ref<GameState>(createInitialState());
  const displayBoard = ref<Board>(toViewBoard(state.value));
  const extraTurnActive = ref(false);
  const lastError = ref<MoveErrorCode | null>(null);
  /** host 建房后捕获的房间号（同步可用） */
  const createdRoom = ref<string | null>(null);

  const { animating, playMove, kill } = useMoveAnimation(getBoardEl);

  /** 远端动画排队，防止两套动画互踩 displayBoard */
  let pendingRemote: { before: GameState; result: MoveSuccess }[] = [];

  const p2p = useP2PGame({
    authorityState: state,
    onSyncState,
    onMoveReject,
    onRemoteMove,
    getLocalTurn: () => state.value.turn,
  });

  const myPlayerId = computed<PlayerId>(() =>
    p2p.myRole.value === 'host' ? 0 : 1,
  );
  const bottomPlayer = computed<PlayerId>(() =>
    p2p.myRole.value === 'host' ? 0 : 1,
  );
  const controllablePlayers = computed<PlayerId[]>(() => [myPlayerId.value]);

  // ---------- 发起连接 ----------
  // host：createRoom 同步返回房间号，立即捕获供 UI 展示；
  // guest：joinRoom 由上层传入 room 参数，异步建连。
  if (role === 'host') {
    createdRoom.value = p2p.createRoom();
  } else if (role === 'guest' && room) {
    p2p.joinRoom(room);
  }

  // ---------- 点击与落子 ----------
  // pitIndex 是 14 位逻辑索引；转 board 下标后校验
  function canClick(pitIndex: number): boolean {
    if (p2p.status.value !== 'connected' || animating.value) return false;
    const s = state.value;
    if (s.finished || s.currentPlayer !== myPlayerId.value) return false;
    if (isStoreLogical(pitIndex)) return false;
    const bIdx = logicalToBoardPit(pitIndex);
    if (!PITS[myPlayerId.value].includes(bIdx)) return false;
    return s.board[bIdx] > 0;
  }

  function handlePitClick(pitIndex: number) {
    if (!canClick(pitIndex)) return;
    const bIdx = logicalToBoardPit(pitIndex);
    const before = state.value;
    const result = applyMove(before, bIdx, myPlayerId.value);
    if (!result.ok) return;

    if (p2p.myRole.value === 'host') state.value = result.state;
    else p2p.sendMove(bIdx, before.turn);

    extraTurnActive.value = result.extraTurn;
    playMove(displayBoard, before, result, myPlayerId.value, {
      onCommit: () => {},
      onAfterCommit: (res) => {
        // host 本地动画播完才广播
        if (p2p.myRole.value === 'host') p2p.broadcastHostMoveResult(res.state);
        // 处理排队的远端动画
        const next = pendingRemote.shift();
        if (next) {
          playMove(displayBoard, next.before, next.result, myPlayerId.value === 0 ? 1 : 0, {
            onCommit: () => {},
            onAfterCommit: (r) => {
              if (p2p.myRole.value === 'host') p2p.broadcastHostMoveResult(r.state);
            },
          });
        }
      },
    });
  }

  // ---------- 远端消息回调 ----------
  function onRemoteMove(result: MoveSuccess, before: GameState) {
    extraTurnActive.value =
      result.extraTurn && result.state.currentPlayer === myPlayerId.value;
    if (animating.value) {
      pendingRemote.push({ before, result });
      return;
    }
    playMove(displayBoard, before, result, myPlayerId.value === 0 ? 1 : 0, {
      onCommit: () => {},
      onAfterCommit: (r) => {
        if (p2p.myRole.value === 'host') p2p.broadcastHostMoveResult(r.state);
      },
    });
  }

  function onSyncState(s: GameState) {
    state.value = s;
    if (s.finished || s.currentPlayer !== myPlayerId.value) {
      extraTurnActive.value = false;
    }
    if (!animating.value) displayBoard.value = toViewBoard(s);
  }

  function onMoveReject(err: MoveErrorCode, current: GameState) {
    kill();
    pendingRemote = [];
    state.value = current;
    displayBoard.value = toViewBoard(current);
    lastError.value = err;
    window.setTimeout(() => {
      if (lastError.value === err) lastError.value = null;
    }, 2500);
  }

  // ---------- 生命周期 ----------
  function reset() {
    kill();
    pendingRemote = [];
    state.value = createInitialState();
    displayBoard.value = toViewBoard(state.value);
    extraTurnActive.value = false;
    lastError.value = null;
  }

  function destroy() {
    kill();
    pendingRemote = [];
    p2p.disconnect();
  }

  // ---------- Step 2 技能字段 stub（Step 4 联机盲选再增强） ----------
  const chars = computed<[string, string]>(() => state.value.chars);
  const skillUsed = computed<[boolean, boolean]>(() => state.value.skillUsed);
  const activeEffects = computed<Effect[]>(() => state.value.effects);
  const pendingTibao = computed(() => false);
  const silenced = computed<PlayerId[]>(() => []);
  const direction = computed<'cw' | 'ccw' | undefined>(
    () => state.value.direction,
  );
  function setChars(_chars: [string, string]) {
    // Step 4：盲选确认后由 host 下发 CHAR_REVEAL 写入
  }
  function setDirection(_dir: 'cw' | 'ccw') {
    // Step 4
  }
  function canUseSkill(_player: PlayerId): boolean {
    return false; // Step 4
  }
  function useSkill(
    _skillId: string,
    _pit?: number,
    _targetPit?: number,
    _direction?: 'cw' | 'ccw',
  ): boolean {
    return false; // Step 4
  }
  function previewSowPath(pitIndex: number, dir?: 'cw' | 'ccw'): number[] {
    const s = state.value;
    return getSowPath(s.board, s.stores, pitIndex, dir ?? s.direction ?? 'ccw');
  }
  function getSkillHint(_player: PlayerId): number | undefined {
    return undefined;
  }

  return {
    mode: 'online',
    state,
    displayBoard,
    animating,
    bottomPlayer,
    controllablePlayers,
    extraTurnActive,
    lastError,
    p2pStatus: computed(() => p2p.status.value),
    canClick,
    handlePitClick,
    reset,
    destroy,
    // host 建房后供 UI 展示的房间号
    createdRoom,
    // 透传 P2P 专用方法（reconnect / disconnect / error / myRole 等）
    ...p2p,
    // Step 2 技能系统 stub
    chars,
    skillUsed,
    activeEffects,
    pendingTibao,
    silenced,
    direction,
    setChars,
    setDirection,
    canUseSkill,
    useSkill,
    previewSowPath,
    getSkillHint,
  } as MatchAdapter & ReturnType<typeof useP2PGame> & {
    createdRoom: typeof createdRoom;
  };
}
