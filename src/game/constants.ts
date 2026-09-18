/**
 * 棋盘常量与无状态小工具（V0.3 角色技能版）
 * ==================================================================
 * 权威棋盘模型：
 *   - board: number[12]，纯坑位（无计分坑槽）
 *       索引 0~5  = 玩家0 的六个普通坑
 *       索引 6~11 = 玩家1 的六个普通坑
 *   - stores: [number, number]，独立计分坑（stores[0]=P0, stores[1]=P1）
 *
 * 为了让 UI 渲染 / GSAP 飞子动画 / data-pit-index 保持统一的 14 槽布局，
 * 内部播种用「逻辑环」：14 个逻辑位，0~5=P0坑, 6=P0计分, 7~12=P1坑, 13=P1计分。
 * board 与 logical 之间用 logicalToBoardPit / boardPitToLogical 互转。
 * 全部为值/纯函数，不依赖 types 以外的任何模块。
 */
import type { PlayerId } from './types';

/** 权威棋盘坑位数（纯坑位，不含计分坑） */
export const BOARD_SIZE = 12;

/** 双方普通坑位索引（board 数组下标） */
export const PITS: Record<PlayerId, number[]> = {
  0: [0, 1, 2, 3, 4, 5],
  1: [6, 7, 8, 9, 10, 11],
};

/** 开局每个普通坑的棋子数（经典曼卡拉 = 4） */
export const INITIAL_STONES_PER_PIT = 4;

/** 初始棋盘：12 元素，每坑 4 颗 */
export const INITIAL_BOARD: number[] = Array(12).fill(INITIAL_STONES_PER_PIT);

// ==================== 逻辑环（14 位，含 2 计分位） ====================

/** 逻辑环长度：6 坑 + 1 计分 + 6 坑 + 1 计分 */
export const LOGICAL_SIZE = 14;

/** 双方计分坑在逻辑环中的位置（6 = P0 计分, 13 = P1 计分） */
export const STORE_LOGICAL: readonly [number, number] = [6, 13];

/** 给定逻辑位是否为计分坑 */
export function isStoreLogical(logical: number): boolean {
  return logical === 6 || logical === 13;
}

/** 计分逻辑位 → 计分数组下标（0 或 1） */
export function storeLogicalToIndex(logical: number): PlayerId {
  return logical === 6 ? 0 : 1;
}

/** 计分数组下标 → 计分逻辑位 */
export function storeIndexToLogical(storeIdx: PlayerId): number {
  return storeIdx === 0 ? 6 : 13;
}

/** 逻辑坑位（0~5, 7~12）→ board 数组下标（0~11）。计分位不要传入。 */
export function logicalToBoardPit(logical: number): number {
  return logical < 6 ? logical : logical - 1;
}

/** board 数组下标（0~11）→ 逻辑坑位（0~5, 7~12） */
export function boardPitToLogical(boardIdx: number): number {
  return boardIdx < 6 ? boardIdx : boardIdx + 1;
}

/** 逻辑坑位 → 其所属玩家（0 或 1）。计分位不要传入。 */
export function logicalPitOwner(logical: number): PlayerId {
  return logical < 6 ? 0 : 1;
}

/** board 坑位下标 → 其所属玩家 */
export function boardPitOwner(boardIdx: number): PlayerId {
  return boardIdx < 6 ? 0 : 1;
}

/**
 * 逻辑坑位的「对面」逻辑位（捕获规则用）：
 *   0↔12, 1↔11, 2↔10, 3↔9, 4↔8, 5↔7
 * 公式 12 - logical 对所有坑位逻辑位统一。
 */
export function oppositeLogical(logical: number): number {
  return 12 - logical;
}

/**
 * board 坑位下标的「对面」board 坑位下标（捕获规则用）：
 *   0↔11, 1↔10, 2↔9, 3↔8, 4↔7, 5↔6
 * 公式 11 - boardIdx 对所有坑位统一。
 */
export function oppositePit(boardIdx: number): number {
  return 11 - boardIdx;
}

/** 对家玩家编号 */
export function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}
