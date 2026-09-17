/**
 * 棋盘常量与无状态小工具
 * 全部为值/纯函数，不依赖 types 以外的任何模块
 */
import type { PlayerId } from './types';

/** 棋盘总长度（6 坑 + 1 计分坑）× 2 */
export const BOARD_SIZE = 14;

/** 双方计分坑索引 */
export const STORE: Record<PlayerId, number> = {
  0: 6,
  1: 13,
};

/** 双方普通坑位索引（播种逆时针递增：0→13→0 循环） */
export const PITS: Record<PlayerId, number[]> = {
  0: [0, 1, 2, 3, 4, 5],
  1: [7, 8, 9, 10, 11, 12],
};

/** 开局每个普通坑的棋子数（经典曼卡拉 = 4） */
export const INITIAL_STONES_PER_PIT = 4;

/** 初始棋盘：[4,4,4,4,4,4, 0, 4,4,4,4,4,4, 0] */
export const INITIAL_BOARD: number[] = [
  ...Array(6).fill(INITIAL_STONES_PER_PIT),
  0,
  ...Array(6).fill(INITIAL_STONES_PER_PIT),
  0,
];

/** 是否为计分坑 */
export function isStore(index: number): boolean {
  return index === 6 || index === 13;
}

/** 对家玩家编号 */
export function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/**
 * 坑位对面对称索引（捕获规则用）：
 *   0↔12, 1↔11, 2↔10, 3↔9, 4↔8, 5↔7
 * 计分坑不存在对面，传入计分坑无意义
 */
export function oppositePit(index: number): number {
  return 12 - index;
}
