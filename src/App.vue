<!--
  《星穹播棋》V0.2 壳层：三视图路由 + 全组件编排。
  view: mode-select → lobby-online → in-game
  全部规则与网络逻辑经 useMatch facade（三模式 adapter）编排，
  本组件只做视图切换、视角翻转、回合文案与终局结算。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModeSelectPanel from './components/ModeSelectPanel.vue';
import LobbyPanel from './components/LobbyPanel.vue';
import GameBoard from './components/GameBoard.vue';
import ScoreBoard from './components/ScoreBoard.vue';
import TurnBanner from './components/TurnBanner.vue';
import ConnectToast from './components/ConnectToast.vue';
import ResultModal from './components/ResultModal.vue';
import RulesModal from './components/RulesModal.vue';
import { useMatch } from './composables/useMatch';
import type { AiDifficulty } from './game/ai';
import type { PlayerId } from './game/types';

type View = 'mode-select' | 'lobby-online' | 'in-game';
const view = ref<View>('mode-select');

// ---------- 规则教程弹窗（首次访问自动弹出） ----------
const RULES_KEY = 'xqboqi.rules.seen';
const showRules = ref(!localStorage.getItem(RULES_KEY));
function closeRules() {
  showRules.value = false;
  localStorage.setItem(RULES_KEY, '1');
}
function openRules() {
  showRules.value = true;
}

// ---------- 编排层 ----------
const gameBoardRef = ref<InstanceType<typeof GameBoard> | null>(null);
const {
  mode,
  startLocal,
  startAi,
  startOnlineAsHost,
  startOnlineAsGuest,
  state,
  displayBoard,
  bottomPlayer,
  extraTurnActive,
  lastError,
  canClick,
  handlePitClick,
  reset,
  destroy,
  online: { status, error, myRole, createdRoom, reconnect },
} = useMatch({
  getBoardEl: () => (gameBoardRef.value?.$el as HTMLElement | null) ?? null,
});

// ---------- 模式选择 ----------
function selectLocal() {
  startLocal();
  view.value = 'in-game';
}
function selectAi(difficulty: AiDifficulty) {
  startAi(difficulty);
  view.value = 'in-game';
}
function selectOnline() {
  view.value = 'lobby-online';
}

// ---------- 在线大厅 ----------
function onCreateRoom() {
  startOnlineAsHost();
  // createdRoom computed 同步可读（p2p.createRoom 在 adapter 构造时同步返回）
}
function onJoinRoom(room: string) {
  startOnlineAsGuest(room);
}
function onConnected() {
  view.value = 'in-game';
}
function onBackToModeSelect() {
  destroy();
  view.value = 'mode-select';
}

// ---------- 视角翻转（基于 bottomPlayer） ----------
// host / local / ai：己方 = 玩家 0 在下；guest：己方 = 玩家 1 在下
const bottomPits = computed(() =>
  bottomPlayer.value === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12],
);
const topPits = computed(() =>
  bottomPlayer.value === 0 ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0],
);
const myStore = computed(() => (bottomPlayer.value === 0 ? 6 : 13));
const oppStore = computed(() => (bottomPlayer.value === 0 ? 13 : 6));

// ---------- 实时比分 ----------
const score0 = computed(() => state.value.board[6]);
const score1 = computed(() => state.value.board[13]);

// ---------- 双方标签 ----------
const label0 = computed(() => {
  if (mode.value === 'local') return '玩家 1';
  if (mode.value === 'ai') return '你';
  if (mode.value === 'online') return myRole.value === 'host' ? '你' : '对手';
  return '';
});
const label1 = computed(() => {
  if (mode.value === 'local') return '玩家 2';
  if (mode.value === 'ai') return 'AI';
  if (mode.value === 'online') return myRole.value === 'host' ? '对手' : '你';
  return '';
});

// ---------- 回合横幅 ----------
const banner = computed(() => {
  const s = state.value;
  if (s.finished) {
    if (s.winner === null) return { mode: 'end' as const, text: '游戏结束：平局' };
    const winLabel = s.winner === 0 ? label0.value : label1.value;
    return { mode: 'end' as const, text: `${winLabel} 获胜！` };
  }
  const cp: PlayerId = s.currentPlayer;
  const cpLabel = cp === 0 ? label0.value : label1.value;

  if (extraTurnActive.value) {
    return { mode: 'extra' as const, text: `${cpLabel} · 额外回合！` };
  }
  // AI 回合：显示思考中
  if (mode.value === 'ai' && cp === 1) {
    return { mode: 'p1' as const, text: 'AI 思考中...' };
  }
  return {
    mode: cp === 0 ? ('p0' as const) : ('p1' as const),
    text: `${cpLabel} 回合`,
  };
});

// ---------- 终局结算 ----------
const showResult = ref(false);
watch(
  () => state.value.finished,
  (finished) => {
    if (finished) showResult.value = true;
  },
);
function onRematch() {
  showResult.value = false;
  reset();
}
function onExitToLobby() {
  showResult.value = false;
  destroy();
  view.value = 'mode-select';
}
</script>

<template>
  <div class="w-full max-w-2xl p-3 md:p-6">
    <!-- 视图 1：模式选择 -->
    <ModeSelectPanel
      v-if="view === 'mode-select'"
      @select-local="selectLocal"
      @select-ai="selectAi"
      @select-online="selectOnline"
      @show-rules="openRules"
    />

    <!-- 视图 2：在线大厅 -->
    <LobbyPanel
      v-else-if="view === 'lobby-online'"
      :status="status"
      :error="error"
      :created-room="createdRoom"
      @create="onCreateRoom"
      @join="onJoinRoom"
      @connected="onConnected"
      @back="onBackToModeSelect"
      @show-rules="openRules"
    />

    <!-- 视图 3：对局 -->
    <template v-else>
      <ScoreBoard
        :score0="score0"
        :score1="score1"
        :label0="label0"
        :label1="label1"
        :active-player="state.currentPlayer"
      />

      <TurnBanner :mode="banner.mode" :text="banner.text" />

      <p v-if="lastError" class="mb-2 text-center text-xs text-red-400">
        操作被驳回：{{ lastError }}（已回滚）
      </p>

      <GameBoard
        ref="gameBoardRef"
        :board="displayBoard"
        :top-pits="topPits"
        :bottom-pits="bottomPits"
        :my-store="myStore"
        :opp-store="oppStore"
        :can-click="canClick"
        :bottom-player="bottomPlayer"
        :active-player="state.currentPlayer"
        @pit-click="handlePitClick"
      />
    </template>

    <!-- 断线提示（仅在线模式） -->
    <ConnectToast
      v-if="mode === 'online' && view === 'in-game'"
      :status="status"
      @reconnect="reconnect"
    />

    <!-- 终局结算 -->
    <ResultModal
      v-if="showResult && state.finished"
      :winner="state.winner"
      :score0="score0"
      :score1="score1"
      :label0="label0"
      :label1="label1"
      @rematch="onRematch"
      @exit="onExitToLobby"
    />

    <!-- 规则教程弹窗（全局） -->
    <RulesModal :visible="showRules" @close="closeRules" />
  </div>
</template>
