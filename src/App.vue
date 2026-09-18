<!--
  《星穹播棋》V0.3 Step 2 壳层：四视图路由 + 全组件编排。
  view: mode-select → char-select → in-game（Local）；其他模式直接进 lobby/in-game
  全部规则与网络逻辑经 useMatch facade（三模式 adapter）编排，
  本组件只做视图切换、视角翻转、回合文案、技能 UI 与终局结算。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModeSelectPanel from './components/ModeSelectPanel.vue';
import LobbyPanel from './components/LobbyPanel.vue';
import CharSelectPanel from './components/CharSelectPanel.vue';
import GameBoard from './components/GameBoard.vue';
import ScoreBoard from './components/ScoreBoard.vue';
import TurnBanner from './components/TurnBanner.vue';
import ConnectToast from './components/ConnectToast.vue';
import ResultModal from './components/ResultModal.vue';
import RulesModal from './components/RulesModal.vue';
import SkillButton from './components/SkillButton.vue';
import SkillConfirmModal from './components/SkillConfirmModal.vue';
import { useMatch } from './composables/useMatch';
import { getCharacter } from './characters';
import {
  applyMove,
  captureStones,
  sowSeeds,
  toViewBoard,
} from './game/engine';
import type { AiDifficulty } from './game/ai';
import type { PlayerId } from './game/types';

type View = 'mode-select' | 'char-select' | 'lobby-online' | 'in-game';
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
  // Step 2 技能系统
  chars,
  skillUsed,
  pendingTibao,
  activeHint,
  silenced,
  canUseSkill,
  useSkill,
  setChars,
  previewSowPath,
  getSkillHint,
  online: { status, error, myRole, createdRoom, reconnect },
} = useMatch({
  getBoardEl: () => (gameBoardRef.value?.$el as HTMLElement | null) ?? null,
});

// ---------- 模式选择 ----------
function selectLocal() {
  startLocal();
  view.value = 'char-select';
}
function selectAi(difficulty: AiDifficulty) {
  startAi(difficulty);
  view.value = 'in-game'; // PvE 选人 Step 3 再做
}
function selectOnline() {
  view.value = 'lobby-online';
}

// ---------- 选人完成（Local） ----------
function onCharsConfirmed(newChars: [string, string]) {
  setChars(newChars);
  view.value = 'in-game';
}

// ---------- 在线大厅 ----------
function onCreateRoom() {
  startOnlineAsHost();
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
const bottomPits = computed(() =>
  bottomPlayer.value === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12],
);
const topPits = computed(() =>
  bottomPlayer.value === 0 ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0],
);
const myStore = computed(() => (bottomPlayer.value === 0 ? 6 : 13));
const oppStore = computed(() => (bottomPlayer.value === 0 ? 13 : 6));

// ---------- 实时比分 ----------
const score0 = computed(() => state.value.stores[0]);
const score1 = computed(() => state.value.stores[1]);

// ---------- 双方标签 + 角色名 ----------
const char0Name = computed(() => getCharacter(chars.value[0])?.name ?? '');
const char1Name = computed(() => getCharacter(chars.value[1])?.name ?? '');
const label0 = computed(() => {
  if (mode.value === 'local') return char0Name.value ? `玩家1·${char0Name.value}` : '玩家 1';
  if (mode.value === 'ai') return char0Name.value ? `你·${char0Name.value}` : '你';
  if (mode.value === 'online') return myRole.value === 'host' ? '你' : '对手';
  return '';
});
const label1 = computed(() => {
  if (mode.value === 'local') return char1Name.value ? `玩家2·${char1Name.value}` : '玩家 2';
  if (mode.value === 'ai') return 'AI';
  if (mode.value === 'online') return myRole.value === 'host' ? '对手' : '你';
  return '';
});

// ---------- 当前玩家是否被沉默 ----------
const currentSilenced = computed(() =>
  silenced.value.includes(state.value.currentPlayer),
);

// ---------- 技能弹窗 ----------
const skillModalVisible = ref(false);
const skillModalPlayer = computed<PlayerId>(() => state.value.currentPlayer);

function openSkillModal() {
  if (!canUseSkill(state.value.currentPlayer)) return;
  skillModalVisible.value = true;
}

/** 技能按钮点击：那刻夏「洞察」直接发动（无需确认弹窗），其余走确认弹窗 */
function onSkillButtonClick() {
  const me = state.value.currentPlayer;
  if (chars.value[me] === 'nakkari') {
    useSkill('nakkari');
  } else {
    openSkillModal();
  }
}
function onSkillConfirm(payload: { pit: number; targetPit?: number; direction?: 'cw' | 'ccw' }) {
  const me = state.value.currentPlayer;
  const charId = chars.value[me];
  skillModalVisible.value = false;
  if (charId) {
    useSkill(charId, payload.pit, payload.targetPit, payload.direction);
  }
}
function onSkillCancel() {
  skillModalVisible.value = false;
}

// ---------- 技能沙盘预览函数 ----------
function previewSkillBoard(
  pit: number,
  targetPit: number | undefined,
  direction: 'cw' | 'ccw' | undefined,
): number[] {
  const s = state.value;
  const me = s.currentPlayer;
  const char = getCharacter(s.chars[me]);
  if (!char?.active) return [];
  const ctx = { state: s, player: me, sowSeeds, captureStones, applyMove };
  const r = char.active(ctx, pit, targetPit, direction);
  return toViewBoard({ ...s, board: r.board, stores: r.stores });
}

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

  // 缇宝待落子中间态
  if (pendingTibao.value) {
    return { mode: 'extra' as const, text: `缇宝：请选择一个坑落子` };
  }
  if (extraTurnActive.value) {
    return { mode: 'extra' as const, text: `${cpLabel} · 额外回合！` };
  }
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

    <!-- 视图 2：选人（Local） -->
    <CharSelectPanel
      v-else-if="view === 'char-select'"
      @confirmed="onCharsConfirmed"
      @back="onBackToModeSelect"
    />

    <!-- 视图 3：在线大厅 -->
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

    <!-- 视图 4：对局 -->
    <template v-else>
      <ScoreBoard
        :score0="score0"
        :score1="score1"
        :label0="label0"
        :label1="label1"
        :active-player="state.currentPlayer"
      />

      <TurnBanner :mode="banner.mode" :text="banner.text" />

      <!-- 那刻夏封印提示 -->
      <p
        v-if="currentSilenced"
        class="mb-2 text-center text-xs text-gray-500"
      >
        你的技能已被那刻夏封印
      </p>

      <p v-if="lastError" class="mb-2 text-center text-xs text-red-400">
        操作被驳回：{{ lastError }}（已回滚）
      </p>

      <!-- 洞察高亮提示 -->
      <p
        v-if="activeHint !== undefined"
        class="mb-2 text-center text-xs text-stellar-gold"
      >
        那刻夏·洞察：已用金色高亮期望净得分最高的落点
      </p>

      <!-- 技能按钮（当前玩家一侧） -->
      <div
        v-if="chars[state.currentPlayer]"
        class="mb-2 flex justify-center"
      >
        <SkillButton
          :char-id="chars[state.currentPlayer]"
          :used="skillUsed[state.currentPlayer]"
          :silenced="currentSilenced"
          :can-use="canUseSkill(state.currentPlayer)"
          @activate="onSkillButtonClick"
        />
      </div>

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
        :hint-board-pit="activeHint"
        @pit-click="handlePitClick"
      />
    </template>

    <!-- 断线提示（仅在线模式） -->
    <ConnectToast
      v-if="mode === 'online' && view === 'in-game'"
      :status="status"
      @reconnect="reconnect"
    />

    <!-- 技能确认弹窗 -->
    <SkillConfirmModal
      :visible="skillModalVisible"
      :char-id="chars[skillModalPlayer] ?? ''"
      :player="skillModalPlayer"
      :board="state.board"
      :preview="previewSkillBoard"
      @confirm="onSkillConfirm"
      @cancel="onSkillCancel"
    />

    <!-- 终局结算 -->
    <ResultModal
      v-if="showResult && state.finished"
      :winner="state.winner"
      :score0="score0"
      :score1="score1"
      :label0="label0"
      :label1="label1"
      :char-name-0="char0Name"
      :char-name-1="char1Name"
      @rematch="onRematch"
      @exit="onExitToLobby"
    />

    <!-- 规则教程弹窗（全局） -->
    <RulesModal :visible="showRules" @close="closeRules" />
  </div>
</template>
