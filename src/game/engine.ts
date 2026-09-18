/**
 * 曼卡拉棋核心引擎 —— 纯函数模块（V0.3 角色技能版）
 * ==================================================================
 * 设计约束：
 *   1. 零依赖（只引 types/constants），不 import Vue、PeerJS、DOM；
 *   2. 所有函数均为纯函数：不修改入参，不产生副作用，同输入必同输出；
 *   3. 本文件可原样搬进 Web Worker，供后续 Minimax AI 直接复用。
 *
 * 权威棋盘模型：
 *   - board: number[12]，纯坑位（无计分槽）
 *       索引 0~5  = 玩家0 的六个普通坑
 *       索引 6~11 = 玩家1 的六个普通坑
 *   - stores: [number, number]，独立计分坑
 *   - 内部播种走 14 位逻辑环（0~5 P0坑 / 6 P0计分 / 7~12 P1坑 / 13 P1计分）
 *
 * 经典规则：
 *   - 取走所选坑全部棋子，沿指定方向（默认 ccw）每坑播 1 颗；
 *   - 播种经过【对方计分坑】时跳过，不投放、不消耗；
 *   - 最后一颗落入【己方计分坑】→ 额外回合；
 *   - 最后一颗落入【己方原本为空的普通坑】→ 把该颗棋子连同
 *     对面坑全部棋子（受 onCapture 钩子影响）收入己方计分坑；
 *   - 一方六个普通坑全空 → 终局，双方各自收走己方坑内剩余棋子，
 *     计分坑棋子多者胜（相等为平局）。
 *
 * 角色被动通过 SowHooks 介入：无 hooks 时行为与纯曼卡拉完全一致。
 */
import {
  BOARD_SIZE,
  INITIAL_BOARD,
  PITS,
  boardPitOwner,
  boardPitToLogical,
  isStoreLogical,
  logicalPitOwner,
  logicalToBoardPit,
  opponent,
  oppositeLogical,
  storeLogicalToIndex,
} from './constants';
import { MoveErrorCode } from './types';
import type {
  GameState,
  MoveResult,
  MoveSuccess,
  PlayerId,
  SowHooks,
  Stores,
} from './types';

/** 开局状态：玩家 0（房主）先手，turn 从 0 开始 */
export function createInitialState(): GameState {
  return {
    board: INITIAL_BOARD.slice(),
    stores: [0, 0],
    currentPlayer: 0,
    turn: 0,
    finished: false,
    winner: null,
    chars: ['', ''],
    skillUsed: [false, false],
    effects: [],
  };
}

/** 指定玩家的六个普通坑是否全空（终局判定） */
export function isSideEmpty(board: number[], player: PlayerId): boolean {
  return PITS[player].every((pit) => board[pit] === 0);
}

/** 当前玩家可以落子的坑位（有棋子的己方坑，board 下标）；终局返回空数组 */
export function getLegalPits(state: GameState): number[] {
  if (state.finished) return [];
  return PITS[state.currentPlayer].filter((pit) => state.board[pit] > 0);
}

// ==================== 播种纯函数 ====================

export interface SowResult {
  /** 播种后的 12 元素 board */
  board: number[];
  /** 播种后的计分坑 */
  stores: Stores;
  /** 最后一颗落点的逻辑位（0~13） */
  lastIndex: number;
  /** 最后一颗是否落入计分坑 */
  lastInStore: boolean;
  /** 播种路径（逻辑位序列，含计分位；供动画用） */
  sowPath: number[];
}

/**
 * 纯函数播种：取走 pitIndex 全部棋子，沿 direction 方向逐位投放。
 * 跳过对手计分位（不投放、不消耗）。每步触发 hooks（如有）。
 *
 * @param board     12 元素棋盘（不会被修改）
 * @param stores    计分坑 [P0, P1]
 * @param pitIndex  起点坑 board 下标（0~11）
 * @param byPlayer  播种发起者（决定哪个计分坑是己方）
 * @param direction 'ccw'（默认，逆时针，logical+1）| 'cw'（顺时针，logical-1）
 * @param hooks     可选的角色被动接入点
 */
export function sowSeeds(
  board: number[],
  stores: Stores,
  pitIndex: number,
  byPlayer: PlayerId,
  direction: 'cw' | 'ccw' = 'ccw',
  hooks?: SowHooks,
): SowResult {
  const b = board.slice();
  const s: Stores = [stores[0], stores[1]];
  const path: number[] = [];

  let stones = b[pitIndex];
  b[pitIndex] = 0;
  let logical = boardPitToLogical(pitIndex);

  const step = (cur: number): number =>
    direction === 'ccw' ? (cur + 1) % 14 : (cur - 1 + 14) % 14;

  while (stones > 0) {
    logical = step(logical);

    if (isStoreLogical(logical)) {
      const storeOwner = storeLogicalToIndex(logical);
      // 跳过对手计分坑：不投放、不消耗
      if (storeOwner !== byPlayer) continue;
      // 己方计分坑
      s[storeOwner] += 1;
      hooks?.onSowStep?.(logical, true, storeOwner);
      const bonus = hooks?.onSeedIntoStore?.(storeOwner) ?? 0;
      s[storeOwner] += bonus;
      path.push(logical);
    } else {
      const boardIdx = logicalToBoardPit(logical);
      const owner = boardPitOwner(boardIdx);
      const before = b[boardIdx];
      b[boardIdx] += 1;
      hooks?.onSowStep?.(logical, false, owner);
      if (before === 0) {
        // 该坑由 0→1：触发 onPitFilled，bonus 累加到 owner 的 stores
        const bonus = hooks?.onPitFilled?.(logical, owner) ?? 0;
        s[owner] += bonus;
      }
      path.push(logical);
    }
    stones -= 1;
  }

  return {
    board: b,
    stores: s,
    lastIndex: logical,
    lastInStore: isStoreLogical(logical),
    sowPath: path,
  };
}

// ==================== 捕获纯函数 ====================

export interface CaptureResult {
  board: number[];
  stores: Stores;
  captured: boolean;
  /** 触发捕获时的对面 board 下标；未触发为 -1 */
  fromOppositeBoardIdx: number;
}

/**
 * 纯函数捕获结算：当 lastIndex 是 byPlayer 己方普通坑、且播后该坑=1
 * （即播前为 0）、且对面坑有棋子时，把对面棋子（受 onCapture 影响）+
 * 末子收入 byPlayer 计分坑。
 */
export function captureStones(
  board: number[],
  stores: Stores,
  lastIndexLogical: number,
  byPlayer: PlayerId,
  hooks?: SowHooks,
): CaptureResult {
  const b = board.slice();
  const s: Stores = [stores[0], stores[1]];

  // 计分位不触发捕获
  if (isStoreLogical(lastIndexLogical)) {
    return { board: b, stores: s, captured: false, fromOppositeBoardIdx: -1 };
  }
  // 必须落在 byPlayer 自己一侧
  if (logicalPitOwner(lastIndexLogical) !== byPlayer) {
    return { board: b, stores: s, captured: false, fromOppositeBoardIdx: -1 };
  }
  const lastBoardIdx = logicalToBoardPit(lastIndexLogical);
  // 播后该坑必须为 1（播前为 0）
  if (b[lastBoardIdx] !== 1) {
    return { board: b, stores: s, captured: false, fromOppositeBoardIdx: -1 };
  }
  const oppositeLogicalIdx = oppositeLogical(lastIndexLogical);
  const oppositeBoardIdx = logicalToBoardPit(oppositeLogicalIdx);
  const oppositeStones = b[oppositeBoardIdx];
  if (oppositeStones <= 0) {
    return { board: b, stores: s, captured: false, fromOppositeBoardIdx: -1 };
  }

  // owner = 受害者（对面坑所属玩家）
  const owner = boardPitOwner(oppositeBoardIdx);
  const cap =
    hooks?.onCapture?.(oppositeBoardIdx, oppositeStones, owner) ?? {
      take: oppositeStones,
      leave: 0,
    };

  // stores[byPlayer] += take + 1（末子）
  s[byPlayer] += cap.take + 1;
  b[oppositeBoardIdx] = cap.leave;
  b[lastBoardIdx] = 0;

  // 捕获完成后回调（万敌 +1）
  const bonusComplete =
    hooks?.onCaptureComplete?.(cap.take, oppositeBoardIdx) ?? 0;
  s[byPlayer] += bonusComplete;

  return {
    board: b,
    stores: s,
    captured: true,
    fromOppositeBoardIdx: oppositeBoardIdx,
  };
}

// ==================== applyMove ====================

/**
 * 执行一次落子。
 *
 * @param state    当前对局状态（不会被修改）
 * @param pitIndex 选择的坑位 board 下标（0~11）
 * @param byPlayer 发起者视角（默认取 state.currentPlayer）
 * @param hooks    可选的角色被动接入点（由 dispatcher 构造）
 */
export function applyMove(
  state: GameState,
  pitIndex: number,
  byPlayer: PlayerId = state.currentPlayer,
  hooks?: SowHooks,
): MoveResult {
  // ---------- 合法性校验（顺序即错误优先级） ----------
  if (state.finished) {
    return { ok: false, error: MoveErrorCode.GameFinished };
  }
  if (byPlayer !== state.currentPlayer) {
    return { ok: false, error: MoveErrorCode.NotYourTurn };
  }
  if (!Number.isInteger(pitIndex) || pitIndex < 0 || pitIndex >= BOARD_SIZE) {
    return { ok: false, error: MoveErrorCode.InvalidPit };
  }
  if (!PITS[state.currentPlayer].includes(pitIndex)) {
    return { ok: false, error: MoveErrorCode.OpponentPit };
  }
  if (state.board[pitIndex] === 0) {
    return { ok: false, error: MoveErrorCode.EmptyPit };
  }

  const player = state.currentPlayer;
  // 缇宝方向：从 state.direction 读取，默认 ccw
  const direction: 'cw' | 'ccw' = state.direction ?? 'ccw';

  // ---------- 播种 + 捕获 ----------
  const sow = sowSeeds(
    state.board,
    state.stores,
    pitIndex,
    player,
    direction,
    hooks,
  );
  const cap = captureStones(
    sow.board,
    sow.stores,
    sow.lastIndex,
    player,
    hooks,
  );

  const board = cap.board;
  const stores = cap.stores;
  const captured = cap.captured;
  const extraTurn = sow.lastInStore;

  // ---------- 终局判定与扫盘 ----------
  let finished = false;
  let winner: PlayerId | null = null;

  if (isSideEmpty(board, 0) || isSideEmpty(board, 1)) {
    const allPlayers: PlayerId[] = [0, 1];
    allPlayers.forEach((p) => {
      const remaining = PITS[p].reduce((sum, pit) => sum + board[pit], 0);
      stores[p] += remaining;
      PITS[p].forEach((pit) => {
        board[pit] = 0;
      });
    });
    finished = true;
    if (stores[0] > stores[1]) winner = 0;
    else if (stores[1] > stores[0]) winner = 1;
    // winner 保持 null 即平局
  }

  const next: GameState = {
    board,
    stores,
    finished,
    winner,
    turn: state.turn + 1,
    // 终局后 currentPlayer 无意义，保持为最后落子者；额外回合则不切换
    currentPlayer:
      finished ? player : extraTurn ? player : opponent(player),
    // 透传技能字段
    chars: state.chars,
    skillUsed: state.skillUsed,
    effects: state.effects,
    // 透传 snapshot（昔涟悔棋用，本回合内保留）
    snapshot: state.snapshot,
    // direction 每回合重置（缇宝下回合重新选）
  };

  const result: MoveSuccess = {
    ok: true,
    state: next,
    extraTurn: extraTurn && !finished,
    captured,
    pitIndex,
    lastIndex: sow.lastIndex,
    sowPath: sow.sowPath,
  };
  return result;
}

// ==================== getSowPath（只读，供动画） ====================

/**
 * 计算播种路径（纯函数，供 UI 动画与 AI 评估复用）。
 * 与 sowSeeds 的播种循环同构，但不修改 board/stores，只读。
 *
 * @param board     12 元素棋盘
 * @param stores    计分坑（保留签名一致性，本函数不读，但调用方传值）
 * @param pitIndex  起点坑 board 下标
 * @param direction 'ccw'（默认）| 'cw'
 * @returns 依次落点的逻辑位数组（含计分位，不含起点；跳过对方计分位）
 */
export function getSowPath(
  board: number[],
  stores: Stores,
  pitIndex: number,
  direction: 'cw' | 'ccw' = 'ccw',
): number[] {
  void stores; // 保留签名一致性，本函数不读
  const player = boardPitOwner(pitIndex);
  const path: number[] = [];
  let stones = board[pitIndex];
  let logical = boardPitToLogical(pitIndex);

  const step = (cur: number): number =>
    direction === 'ccw' ? (cur + 1) % 14 : (cur - 1 + 14) % 14;

  while (stones > 0) {
    logical = step(logical);
    if (isStoreLogical(logical)) {
      const storeOwner = storeLogicalToIndex(logical);
      if (storeOwner !== player) continue;
    }
    path.push(logical);
    stones -= 1;
  }
  return path;
}

// ==================== toViewBoard（14 元素视图） ====================

/**
 * 将权威 state 映射为 14 元素视图棋盘，供 UI 渲染与动画索引：
 *   view[0..5]  = board[0..5]   (P0 普通坑)
 *   view[6]     = stores[0]    (P0 计分坑)
 *   view[7..12] = board[6..11]  (P1 普通坑)
 *   view[13]    = stores[1]    (P1 计分坑)
 * 与 GameBoard / PitCell / useMoveAnimation 的 14 位 data-pit-index 一致。
 */
export function toViewBoard(state: GameState): number[] {
  const view: number[] = new Array(14);
  for (let i = 0; i < 6; i++) view[i] = state.board[i];
  view[6] = state.stores[0];
  for (let i = 7; i <= 12; i++) view[i] = state.board[i - 1];
  view[13] = state.stores[1];
  return view;
}
