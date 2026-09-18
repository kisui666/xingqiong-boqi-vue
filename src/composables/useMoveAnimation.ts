/**
 * useMoveAnimation —— GSAP 播种/捕获动画 composable（从 useMatch 抽出）
 * ==================================================================
 * 三种模式（Local / AI / Online）共用同一套飞子动画。
 * adapter 通过 onCommit / onAfterCommit 钩子接入各自的副作用。
 */
import { ref } from 'vue';
import gsap from 'gsap';
import { getSowPath } from '../game/engine';
import { STORE, oppositePit } from '../game/constants';
import type { Board, GameState, MoveSuccess, PlayerId } from '../game/types';

export interface MoveAnimationCallbacks {
  /** 动画结束、状态已提交时调用 */
  onCommit: (result: MoveSuccess, byPlayer: PlayerId) => void;
  /** commit 之后调用，adapter 在这里检查是否要触发 AI 回合 / 广播 */
  onAfterCommit?: (result: MoveSuccess, byPlayer: PlayerId) => void;
}

export function useMoveAnimation(getBoardEl: () => HTMLElement | null) {
  /** 动画播放中：全局禁点 */
  const animating = ref(false);
  let currentTl: gsap.core.Timeline | null = null;

  /**
   * 播放一手棋的完整动画。
   * @param displayBoard  逐格推进的展示棋盘（调用方持有，动画期间原地修改）
   * @param before        落子前状态
   * @param result        applyMove 返回的成功结果
   * @param byPlayer      落子方
   * @param callbacks     提交钩子
   */
  function playMove(
    displayBoard: { value: Board },
    before: GameState,
    result: MoveSuccess,
    byPlayer: PlayerId,
    callbacks: MoveAnimationCallbacks,
  ) {
    const path = getSowPath(before.board, result.pitIndex);
    animating.value = true;
    displayBoard.value = before.board.slice();

    const boardEl = getBoardEl();
    const overlay = boardEl?.querySelector('[data-fly-overlay]') as HTMLElement | null;

    const tl = gsap.timeline();
    currentTl = tl;

    // ---- 播种 ----
    path.forEach((target, i) => {
      const fromIdx = i === 0 ? result.pitIndex : path[i - 1];
      tl.add(() => {
        flyStone(boardEl, overlay, fromIdx, target, () => {
          displayBoard.value[target] += 1;
        });
      }, i * 0.15);
    });

    let endTime = path.length * 0.15 + 0.1;

    // ---- 捕获 ----
    if (result.captured) {
      const opposite = oppositePit(result.lastIndex);
      const store = STORE[byPlayer];
      const total = before.board[opposite] + 1;
      const capStart = path.length * 0.15 + 0.1;
      const dots = Math.min(total, 8);
      for (let k = 0; k < dots; k++) {
        const fromIdx = k === 0 ? result.lastIndex : opposite;
        tl.add(
          () => flyStone(boardEl, overlay, fromIdx, store, () => {}),
          capStart + k * 0.06,
        );
      }
      const capEnd = capStart + dots * 0.06 + 0.12;
      tl.add(() => {
        displayBoard.value[opposite] = 0;
        displayBoard.value[result.lastIndex] = 0;
        displayBoard.value[store] += total;
      }, capEnd);
      endTime = capEnd + 0.15;
    }

    tl.add(() => commitMove(displayBoard, result, byPlayer, callbacks), endTime);
  }

  function commitMove(
    displayBoard: { value: Board },
    result: MoveSuccess,
    byPlayer: PlayerId,
    callbacks: MoveAnimationCallbacks,
  ) {
    displayBoard.value = result.state.board.slice();
    animating.value = false;
    currentTl = null;
    callbacks.onCommit(result, byPlayer);
    callbacks.onAfterCommit?.(result, byPlayer);
  }

  /** 杀当前 timeline（驳回回滚用） */
  function kill() {
    currentTl?.kill();
    currentTl = null;
    animating.value = false;
  }

  /** 单颗棋子飞行 */
  function flyStone(
    boardEl: HTMLElement | null,
    overlay: HTMLElement | null,
    fromIdx: number,
    toIdx: number,
    onLand: () => void,
  ) {
    if (!boardEl || !overlay) {
      onLand();
      return;
    }
    const from = boardEl.querySelector(`[data-pit-index="${fromIdx}"]`);
    const to = boardEl.querySelector(`[data-pit-index="${toIdx}"]`);
    if (!from || !to) {
      onLand();
      return;
    }
    const fb = from.getBoundingClientRect();
    const tb = to.getBoundingClientRect();
    const bb = boardEl.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:absolute;width:12px;height:12px;border-radius:9999px;' +
      'background:#d4af37;box-shadow:0 0 6px #d4af37;pointer-events:none;z-index:50;' +
      `left:${fb.left + fb.width / 2 - bb.left}px;top:${fb.top + fb.height / 2 - bb.top}px;` +
      'transform:translate(-50%,-50%);';
    overlay.appendChild(dot);
    gsap.to(dot, {
      left: tb.left + tb.width / 2 - bb.left,
      top: tb.top + tb.height / 2 - bb.top,
      duration: 0.13,
      ease: 'power1.in',
      onComplete() {
        onLand();
        gsap.to(dot, { opacity: 0, duration: 0.12, onComplete: () => dot.remove() });
      },
    });
  }

  return { animating, playMove, kill };
}
