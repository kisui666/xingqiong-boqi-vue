/**
 * useMatch —— 对局编排层（Step 4）
 * ==================================================================
 * 把 game/engine（纯函数规则）与 p2p/useP2PGame（通信）粘合成 UI 可
 * 直接消费的状态与动作，组件自身不写任何规则/网络代码。
 *
 * 【回合流程（host 权威 + 双端乐观动画）】
 *   己方点击 → applyMove 本地立即结算（乐观）→ GSAP 播种/捕获动画
 *     → host：动画结束才广播 SYNC_STATE（guest 此时才解锁行动）
 *     → guest：点击时已上交 MOVE；host 裁决通过则 SYNC_STATE 与本地
 *       乐观结果一致（引擎确定性）；被拒则 MOVE_REJECT 杀动画并回滚。
 *
 * 【动画数据流】
 *   displayBoard 是"逐格推进"的展示棋盘：动画期间由 GSAP 回调逐坑 +1，
 *   结束后与 state.board 对齐；动画期间 animating=true 全局禁点。
 */
import { computed, ref } from 'vue';
import gsap from 'gsap';
import { applyMove, createInitialState, getSowPath } from '../game/engine';
import { PITS, STORE, isStore, oppositePit } from '../game/constants';
import { useP2PGame } from '../p2p/useP2PGame';
import type {
  Board,
  GameState,
  MoveErrorCode,
  MoveSuccess,
  PlayerId,
} from '../game/types';

export interface UseMatchOptions {
  /** 棋盘根元素访问器：飞子动画靠它查询 [data-pit-index] 锚点 */
  getBoardEl: () => HTMLElement | null;
}

export function useMatch(options: UseMatchOptions) {
  // ---------- 权威/乐观状态 ----------
  const state = ref<GameState>(createInitialState());
  /** 动画期间逐格推进的展示棋盘，平时与 state.board 同步 */
  const displayBoard = ref<Board>(state.value.board.slice());
  /** 动画播放中：全局禁点（含远端动画） */
  const animating = ref(false);
  /** 本方刚获得额外回合（驱动横幅闪烁） */
  const extraTurnActive = ref(false);
  /** 最近一次被驳回的错误码（UI 短暂展示） */
  const lastError = ref<MoveErrorCode | null>(null);

  /** 动画期间到达的远端落子先排队，防止两套动画互踩 displayBoard */
  const pendingRemote = ref<{ before: GameState; result: MoveSuccess }[]>([]);
  let currentTl: gsap.core.Timeline | null = null;

  const p2p = useP2PGame({
    authorityState: state,
    onSyncState,
    onMoveReject,
    onRemoteMove,
    getLocalTurn: () => state.value.turn,
  });

  /** 本地玩家在权威模型里的编号：host=0（先手），guest=1 */
  const myPlayerId = computed<PlayerId>(() =>
    p2p.myRole.value === 'host' ? 0 : 1,
  );

  // ==================== 点击与落子 ====================

  /** 该坑位当前是否可点（回合/归属/有子/连通/非动画期间） */
  function canClick(pitIndex: number): boolean {
    if (p2p.status.value !== 'connected' || animating.value) return false;
    const s = state.value;
    if (s.finished || s.currentPlayer !== myPlayerId.value) return false;
    if (isStore(pitIndex) || !PITS[myPlayerId.value].includes(pitIndex)) {
      return false;
    }
    return s.board[pitIndex] > 0;
  }

  function handlePitClick(pitIndex: number) {
    if (!canClick(pitIndex)) return;
    const before = state.value;
    const result = applyMove(before, pitIndex, myPlayerId.value);
    if (!result.ok) return; // 坑位禁用兜底，正常到不了这里

    // host：本地即权威；guest：乐观结算 + 上交 host 裁决
    if (p2p.myRole.value === 'host') state.value = result.state;
    else p2p.sendMove(pitIndex, before.turn);

    extraTurnActive.value = result.extraTurn;
    playMove(before, result, myPlayerId.value);
  }

  // ==================== 远端消息回调 ====================

  /** host：guest 的 MOVE 已被权威结算 → 本地重放同一手动画 */
  function onRemoteMove(result: MoveSuccess, before: GameState) {
    extraTurnActive.value =
      result.extraTurn && result.state.currentPlayer === myPlayerId.value;
    if (animating.value) {
      pendingRemote.value.push({ before, result });
      return;
    }
    playMove(before, result, myPlayerId.value === 0 ? 1 : 0);
  }

  /** guest：host 的权威状态到达（正常同步 / 重连覆盖） */
  function onSyncState(s: GameState) {
    state.value = s;
    if (s.finished || s.currentPlayer !== myPlayerId.value) {
      extraTurnActive.value = false;
    }
    // 动画中不打断展示棋盘，动画结束会与权威状态对齐（引擎确定性）
    if (!animating.value) displayBoard.value = s.board.slice();
  }

  /** guest：落子被 host 驳回 → 杀动画并用权威状态回滚 */
  function onMoveReject(err: MoveErrorCode, current: GameState) {
    currentTl?.kill();
    currentTl = null;
    animating.value = false;
    extraTurnActive.value = false;
    pendingRemote.value = [];
    state.value = current;
    displayBoard.value = current.board.slice();
    lastError.value = err;
    window.setTimeout(() => {
      if (lastError.value === err) lastError.value = null;
    }, 2500);
  }

  // ==================== GSAP 动画 ====================

  /**
   * 播放一手棋的完整动画：
   *   播种：每 150ms 一跳，金色棋子从上一坑飞向下一坑，落点数字 +1；
   *   捕获：末子 + 对面棋子依次飞入己方计分坑，随后清坑入账。
   * 结束时提交权威状态并解锁点击。
   */
  function playMove(before: GameState, result: MoveSuccess, byPlayer: PlayerId) {
    const path = getSowPath(before.board, result.pitIndex);
    animating.value = true;
    displayBoard.value = before.board.slice();

    const boardEl = options.getBoardEl();
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
      const total = before.board[opposite] + 1; // 对面棋子 + 末子
      const capStart = path.length * 0.15 + 0.1;
      const dots = Math.min(total, 8); // 上限 8 颗，避免长动画
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

    tl.add(() => commitMove(result), endTime);
  }

  /** 动画结束：提交状态、解锁、（host）广播、处理排队的远端动画 */
  function commitMove(result: MoveSuccess) {
    state.value = result.state;
    displayBoard.value = result.state.board.slice();
    animating.value = false;
    currentTl = null;
    // host 本地动画播完才广播，保证 guest 解锁时 host 已就绪
    if (p2p.myRole.value === 'host') p2p.broadcastHostMoveResult(result.state);
    const next = pendingRemote.value.shift();
    if (next) playMove(next.before, next.result, myPlayerId.value === 0 ? 1 : 0);
  }

  /** 单颗棋子飞行：从 from 坑中心飞到 to 坑中心，落地执行 onLand */
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
    // 星金棋子样式（内联，避免为动画单独建 CSS）
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

  return {
    ...p2p,
    state,
    displayBoard,
    animating,
    extraTurnActive,
    lastError,
    myPlayerId,
    canClick,
    handlePitClick,
  };
}
