/**
 * LocalMatchAdapter —— 本地双人同屏模式（V0.3 Step 2）
 * ==================================================================
 * 双方轮流点击同一设备，无网络，无 AI。
 * bottomPlayer 固定 0（不翻转视角，靠高亮区分当前玩家）。
 *
 * Step 2 接入角色技能 dispatcher：
 *   - setChars：选人完成后写入双方角色，并调 onTurnStart(state,0)
 *     初始化第一回合（风堇填坑 / 昔涟 snapshot / 缇宝 direction 默认）。
 *   - handlePitClick：applyMove 时传 buildHooks 整合被动；落子后
 *     按换人规则调 onTurnStart 初始化新回合。
 *   - useSkill：构造 ActiveContext 调 Character.active，应用
 *     ActionResult 写回 state。缇宝进入 pendingTibao 中间态；昔涟
 *     悔棋写回 snapshot 的 currentPlayer/turn 并清 snapshot；
 *     skillUsed[me] 默认 true，丹恒 skillRefunded 时才返还 false。
 *   - 那刻夏沉默在 canUseSkill / buildHooks 调用处拦截（不删 Character）。
 */
import { computed, ref } from 'vue';
import {
  applyMove,
  captureStones,
  createInitialState,
  getSowPath,
  sowSeeds,
  toViewBoard,
} from '../../game/engine';
import {
  PITS,
  isStoreLogical,
  logicalToBoardPit,
  opponent,
} from '../../game/constants';
import { createDispatcher } from '../../characters/dispatch';
import { getCharacter } from '../../characters';
import type { ActiveContext, ActionResult } from '../../characters/types';
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

export function createLocalMatch(
  getBoardEl: () => HTMLElement | null,
): MatchAdapter {
  const state = ref<GameState>(createInitialState());
  const displayBoard = ref<Board>(toViewBoard(state.value));
  const extraTurnActive = ref(false);
  const lastError = ref<MoveErrorCode | null>(null);
  /** 缇宝中间态：技能已结算，等待玩家补一次正常落子 */
  const pendingTibao = ref(false);
  /** 缇宝技能播种产生的 extraTurn 标记，待落子后与落子 extraTurn 合并 */
  let tibaoSkillExtraTurn = false;

  const { animating, playMove, kill } = useMoveAnimation(getBoardEl);

  // dispatcher 读取 state.value.chars，建一次即可
  const dispatcher = createDispatcher(state.value.chars);

  const bottomPlayer = computed<PlayerId>(() => 0);
  const controllablePlayers = computed<PlayerId[]>(() => [0, 1]);
  const p2pStatus = computed<P2PStatus>(() => 'connected');

  const chars = computed<[string, string]>(() => state.value.chars);
  const skillUsed = computed<[boolean, boolean]>(() => state.value.skillUsed);
  const activeEffects = computed<Effect[]>(() => state.value.effects);
  const direction = computed<'cw' | 'ccw' | undefined>(
    () => state.value.direction,
  );
  const silenced = computed<PlayerId[]>(() => {
    const list: PlayerId[] = [];
    const s = state.value;
    if (s.chars[0] === 'aglaiya' && s.chars[1] === 'nakkari') list.push(0);
    if (s.chars[1] === 'aglaiya' && s.chars[0] === 'nakkari') list.push(1);
    return list;
  });

  /** 那刻夏沉默阿格莱雅：在调用处拦截，不删 Character */
  function isSilenced(player: PlayerId): boolean {
    const s = state.value;
    return (
      s.chars[player] === 'aglaiya' && s.chars[opponent(player)] === 'nakkari'
    );
  }

  // ---------- 落子 ----------
  function canClick(pitIndex: number): boolean {
    if (animating.value) return false;
    const s = state.value;
    if (s.finished) return false;
    const cp = s.currentPlayer;
    if (isStoreLogical(pitIndex)) return false;
    const bIdx = logicalToBoardPit(pitIndex);
    if (!PITS[cp].includes(bIdx)) return false;
    return s.board[bIdx] > 0;
  }

  function handlePitClick(pitIndex: number) {
    if (!canClick(pitIndex)) return;
    const bIdx = logicalToBoardPit(pitIndex);
    const before = state.value;
    const me = before.currentPlayer;
    const hooks = dispatcher.buildHooks(before, me);
    const result = applyMove(before, bIdx, me, hooks);
    if (!result.ok) return;

    // 缇宝中间态落子：合并技能 extraTurn 与落子 extraTurn
    const skillExtra = pendingTibao.value ? tibaoSkillExtraTurn : false;
    pendingTibao.value = false;
    tibaoSkillExtraTurn = false;
    const finalExtra = result.extraTurn || skillExtra;
    extraTurnActive.value = finalExtra;

    playMove(displayBoard, before, result, me, {
      onCommit: (res) => {
        let next = res.state;
        if (!next.finished && !finalExtra) {
          // 换人：初始化对手回合（风堇/效果递减/昔涟 snapshot/缇宝 direction）
          next = dispatcher.onTurnStart(next, next.currentPlayer);
        }
        state.value = next;
      },
    });
  }

  // ---------- 选人 ----------
  function setChars(newChars: [string, string]) {
    const s = createInitialState();
    s.chars = [newChars[0], newChars[1]];
    // 初始化第一回合（player 0）：风堇填坑/昔涟 snapshot/缇宝 direction
    const initialized = dispatcher.onTurnStart(s, 0);
    state.value = initialized;
    displayBoard.value = toViewBoard(state.value);
    extraTurnActive.value = false;
    lastError.value = null;
    pendingTibao.value = false;
    tibaoSkillExtraTurn = false;
  }

  function setDirection(dir: 'cw' | 'ccw') {
    const s = state.value;
    if (s.chars[s.currentPlayer] !== 'tibao') return;
    state.value = { ...s, direction: dir };
  }

  // ---------- 主动技能 ----------
  function canUseSkill(player: PlayerId): boolean {
    const s = state.value;
    if (s.finished) return false;
    if (s.currentPlayer !== player) return false;
    if (pendingTibao.value) return false; // 缇宝中间态不能再放技能
    if (s.skillUsed[player]) return false;
    if (isSilenced(player)) return false; // 那刻夏沉默阿格莱雅
    const char = getCharacter(s.chars[player]);
    return !!char?.active;
  }

  function useSkill(
    skillId: string,
    pit?: number,
    targetPit?: number,
    dir?: 'cw' | 'ccw',
  ): boolean {
    const s = state.value;
    const me = s.currentPlayer;
    if (!canUseSkill(me)) return false;
    if (s.chars[me] !== skillId) return false;
    const char = getCharacter(skillId);
    if (!char?.active) return false;

    const ctx: ActiveContext = {
      state: s,
      player: me,
      sowSeeds,
      captureStones,
      applyMove,
    };

    const r = char.active(ctx, pit ?? 0, targetPit, dir);
    // eslint-disable-next-line no-console
    console.log('[useSkill]', skillId, 'me=', me, 'extraTurn=', r.extraTurn, 'continueAfterSkill=', r.continueAfterSkill);
    applyActionResult(r, me, skillId, s);
    // eslint-disable-next-line no-console
    console.log('[useSkill] after: currentPlayer=', state.value.currentPlayer, 'skillUsed=', state.value.skillUsed);
    return true;
  }

  /** 应用 ActionResult 到 state，处理缇宝中间态 / 昔涟悔棋 / 丹恒返还 */
  function applyActionResult(
    r: ActionResult,
    me: PlayerId,
    skillId: string,
    before: GameState,
  ) {
    const next: GameState = {
      board: r.board,
      stores: r.stores,
      currentPlayer: me,
      turn: before.turn,
      finished: before.finished,
      winner: before.winner,
      chars: before.chars,
      skillUsed: [before.skillUsed[0], before.skillUsed[1]],
      effects: r.effects ?? before.effects.map((e) => ({ ...e })),
      snapshot: before.snapshot,
      // 缇宝中间态保留 direction 供补落子用；其他技能清方向
      direction: r.continueAfterSkill ? before.direction : undefined,
    };
    next.skillUsed[me] = true; // 默认消耗

    // 昔涟悔棋：写回 currentPlayer/turn/清 snapshot；skillUsed 保持 true（不退款）
    if (skillId === 'xilian' && r.skillRefunded) {
      if (before.snapshot) {
        next.currentPlayer = before.snapshot.currentPlayer;
        next.turn = before.snapshot.turn;
        next.snapshot = undefined;
      }
      state.value = next;
      displayBoard.value = toViewBoard(next);
      return;
    }

    // 丹恒固化期间被清空返还（skillRefunded && 非昔涟）
    if (r.skillRefunded) {
      next.skillUsed[me] = false;
    }

    // 缇宝中间态：不切回合，等补一次正常落子
    if (r.continueAfterSkill) {
      pendingTibao.value = true;
      tibaoSkillExtraTurn = r.extraTurn;
      state.value = next;
      displayBoard.value = toViewBoard(next);
      return;
    }

    // 普通技能：extraTurn 决定是否换人
    if (r.extraTurn) {
      extraTurnActive.value = true;
      const init = dispatcher.onTurnStart(next, me);
      state.value = init;
    } else {
      extraTurnActive.value = false;
      next.currentPlayer = opponent(me);
      const init = dispatcher.onTurnStart(next, next.currentPlayer);
      state.value = init;
    }
    // eslint-disable-next-line no-console
    console.log('[applyActionResult] branch normal, extraTurn=', r.extraTurn, 'next.currentPlayer=', state.value.currentPlayer);
    displayBoard.value = toViewBoard(state.value);
  }

  // ---------- 预览与提示 ----------
  function previewSowPath(pitIndex: number, dir?: 'cw' | 'ccw'): number[] {
    const s = state.value;
    const direction = dir ?? s.direction ?? 'ccw';
    return getSowPath(s.board, s.stores, pitIndex, direction);
  }

  /** 那刻夏洞察：不消耗技能，仅返回推荐落点（board 下标） */
  function getSkillHint(player: PlayerId): number | undefined {
    const s = state.value;
    if (s.chars[player] !== 'nakkari') return undefined;
    if (s.currentPlayer !== player) return undefined;
    if (s.skillUsed[player]) return undefined;
    const char = getCharacter('nakkari');
    if (!char?.active) return undefined;
    const ctx: ActiveContext = {
      state: s,
      player,
      sowSeeds,
      captureStones,
      applyMove,
    };
    const r = char.active(ctx, 0, undefined, undefined);
    return r.hintPit;
  }

  // ---------- 生命周期 ----------
  function reset() {
    kill();
    state.value = createInitialState();
    displayBoard.value = toViewBoard(state.value);
    extraTurnActive.value = false;
    lastError.value = null;
    pendingTibao.value = false;
    tibaoSkillExtraTurn = false;
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
    // Step 2 技能系统
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
  };
}
