/**
 * 曼卡拉棋核心引擎 —— 纯函数模块
 * ==================================================================
 * 设计约束：
 *   1. 零依赖（只引 types/constants），不 import Vue、PeerJS、DOM；
 *   2. 所有函数均为纯函数：不修改入参，不产生副作用，同输入必同输出；
 *   3. 本文件可原样搬进 Web Worker，供后续 Minimax AI 直接复用。
 *
 * 经典规则（V0.1）：
 *   - 取走所选坑全部棋子，沿逆时针方向每坑播 1 颗；
 *   - 播种经过【对方计分坑】时跳过，不投放；
 *   - 最后一颗落入【己方计分坑】→ 额外回合；
 *   - 最后一颗落入【己方原本为空的普通坑】→ 把该颗棋子连同
 *     对面坑全部棋子收入己方计分坑（对面为空则不捕获）；
 *   - 一方六个普通坑全空 → 终局，另一方收走己方坑内剩余棋子，
 *     计分坑棋子多者胜（相等为平局）。
 */
import {
  BOARD_SIZE,
  INITIAL_BOARD,
  PITS,
  STORE,
  isStore,
  opponent,
  oppositePit,
} from './constants';
import { MoveErrorCode } from './types';
import type { GameState, MoveResult, PlayerId } from './types';

/** 开局状态：玩家 0（房主）先手，turn 从 0 开始 */
export function createInitialState(): GameState {
  return {
    board: INITIAL_BOARD.slice(),
    currentPlayer: 0,
    turn: 0,
    finished: false,
    winner: null,
  };
}

/** 指定玩家的六个普通坑是否全空（终局判定） */
export function isSideEmpty(board: number[], player: PlayerId): boolean {
  return PITS[player].every((pit) => board[pit] === 0);
}

/** 当前玩家可以落子的坑位（有棋子的己方坑）；终局返回空数组 */
export function getLegalPits(state: GameState): number[] {
  if (state.finished) return [];
  return PITS[state.currentPlayer].filter((pit) => state.board[pit] > 0);
}

/**
 * 执行一次落子。
 *
 * @param state    当前对局状态（不会被修改）
 * @param pitIndex 选择的坑位索引
 * @param byPlayer 发起者视角（默认取 state.currentPlayer）。
 *                 P2P 收到远端 MOVE 时传入本地映射的对家编号，
 *                 用于识别“不是你的回合”这一非法情形。
 */
export function applyMove(
  state: GameState,
  pitIndex: number,
  byPlayer: PlayerId = state.currentPlayer,
): MoveResult {
  // ---------- 合法性校验（顺序即错误优先级） ----------
  if (state.finished) {
    return { ok: false, error: MoveErrorCode.GameFinished };
  }
  if (byPlayer !== state.currentPlayer) {
    return { ok: false, error: MoveErrorCode.NotYourTurn };
  }
  if (
    !Number.isInteger(pitIndex) ||
    pitIndex < 0 ||
    pitIndex >= BOARD_SIZE ||
    isStore(pitIndex)
  ) {
    return { ok: false, error: MoveErrorCode.InvalidPit };
  }
  if (!PITS[state.currentPlayer].includes(pitIndex)) {
    return { ok: false, error: MoveErrorCode.OpponentPit };
  }
  if (state.board[pitIndex] === 0) {
    return { ok: false, error: MoveErrorCode.EmptyPit };
  }

  // ---------- 播种（在棋盘副本上操作，保证纯函数） ----------
  const player = state.currentPlayer;
  const ownStore = STORE[player];
  const board = state.board.slice();

  let stones = board[pitIndex];
  board[pitIndex] = 0;
  let cursor = pitIndex;

  while (stones > 0) {
    cursor = (cursor + 1) % BOARD_SIZE;
    // 跳过对方计分坑（不消耗棋子，继续向前找坑）
    if (isStore(cursor) && cursor !== ownStore) continue;
    board[cursor] += 1;
    stones -= 1;
  }

  // ---------- 特殊结算 ----------
  const extraTurn = cursor === ownStore;
  let captured = false;

  if (!extraTurn && PITS[player].includes(cursor)) {
    // 落点为己方普通坑，且播完后恰好 1 颗 ⇒ 该坑落子前必为空
    if (board[cursor] === 1) {
      const across = oppositePit(cursor);
      // 对面坑有棋子才触发捕获
      if (board[across] > 0) {
        board[ownStore] += board[across] + 1;
        board[cursor] = 0;
        board[across] = 0;
        captured = true;
      }
    }
  }

  // ---------- 终局判定与扫盘 ----------
  let finished = false;
  let winner: PlayerId | null = null;

  if (isSideEmpty(board, 0) || isSideEmpty(board, 1)) {
    // 任一方普通坑全空：双方各自收走己方坑内剩余棋子
    const allPlayers: PlayerId[] = [0, 1];
    allPlayers.forEach((p) => {
      const remaining = PITS[p].reduce((sum, pit) => sum + board[pit], 0);
      board[STORE[p]] += remaining;
      PITS[p].forEach((pit) => {
        board[pit] = 0;
      });
    });
    finished = true;
    if (board[STORE[0]] > board[STORE[1]]) winner = 0;
    else if (board[STORE[1]] > board[STORE[0]]) winner = 1;
    // winner 保持 null 即平局
  }

  const next: GameState = {
    board,
    finished,
    winner,
    turn: state.turn + 1,
    // 终局后 currentPlayer 无意义，保持为最后落子者
    currentPlayer:
      finished || extraTurn ? player : opponent(player),
  };

  return {
    ok: true,
    state: next,
    extraTurn: extraTurn && !finished,
    captured,
    pitIndex,
    lastIndex: cursor,
  };
}

/**
 * 计算播种路径（纯函数，供 UI 动画与 AI 评估复用）。
 * 与 applyMove 的播种循环完全同构：从 pitIndex 起逆时针逐坑，
 * 跳过对方计分坑。前置条件：pitIndex 必须是普通坑位（非计分坑）。
 *
 * @returns 依次落点的坑位索引数组（不含起点）
 */
export function getSowPath(board: number[], pitIndex: number): number[] {
  const player: PlayerId = PITS[0].includes(pitIndex) ? 0 : 1;
  const ownStore = STORE[player];
  const path: number[] = [];
  let stones = board[pitIndex];
  let cursor = pitIndex;
  while (stones > 0) {
    cursor = (cursor + 1) % BOARD_SIZE;
    if (isStore(cursor) && cursor !== ownStore) continue;
    path.push(cursor);
    stones -= 1;
  }
  return path;
}
