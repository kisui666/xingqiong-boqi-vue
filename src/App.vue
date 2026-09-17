<!--
  《星穹播棋》V0.1 壳层：
  大厅（建房/加入）⇄ 对局（横幅 + 棋盘 + 断线提示）。
  全部规则与网络逻辑经 useMatch 编排，本组件只做视图切换与视角翻转。
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import LobbyPanel from './components/LobbyPanel.vue';
import GameBoard from './components/GameBoard.vue';
import TurnBanner from './components/TurnBanner.vue';
import ConnectToast from './components/ConnectToast.vue';
import { useMatch } from './composables/useMatch';

const gameBoardRef = ref<InstanceType<typeof GameBoard> | null>(null);

const {
  state,
  displayBoard,
  extraTurnActive,
  lastError,
  myPlayerId,
  myRole,
  status,
  error,
  canClick,
  handlePitClick,
  createRoom,
  joinRoom,
  reconnect,
} = useMatch({
  // 棋盘根元素：飞子动画据此查询 data-pit-index 锚点
  getBoardEl: () => (gameBoardRef.value?.$el as HTMLElement | null) ?? null,
});

const inGame = ref(false);
const createdRoom = ref<string | null>(null);

function onCreateRoom() {
  createdRoom.value = createRoom();
}

// 视角翻转：双方都始终"己方在下"。
// host：下排 0..5（播种左→右，己方计分坑 6 在右）；
// guest：下排 7..12（播种左→右，己方计分坑 13 在右）。
const isHost = computed(() => myRole.value === 'host');
const bottomPits = computed(() =>
  isHost.value ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12],
);
const topPits = computed(() =>
  isHost.value ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0],
);
const myStore = computed(() => (isHost.value ? 6 : 13));
const oppStore = computed(() => (isHost.value ? 13 : 6));

// 横幅文案（TurnBanner 按 mode 决定颜色与闪烁）
const banner = computed(() => {
  const s = state.value;
  const my = myPlayerId.value;
  if (s.finished) {
    if (s.winner === null) return { mode: 'end' as const, text: '游戏结束：平局' };
    return {
      mode: 'end' as const,
      text: s.winner === my ? '游戏结束：你赢了！' : '游戏结束：你输了',
    };
  }
  if (s.currentPlayer === my) {
    return extraTurnActive.value
      ? { mode: 'extra' as const, text: '额外回合！' }
      : { mode: 'my' as const, text: '你的回合' };
  }
  return { mode: 'opp' as const, text: '对方回合' };
});
</script>

<template>
  <div class="flex min-h-screen flex-col items-center bg-space-black p-3 text-gray-100 md:p-6">
    <LobbyPanel
      v-if="!inGame"
      :status="status"
      :error="error"
      :created-room="createdRoom"
      @create="onCreateRoom"
      @join="joinRoom"
      @connected="inGame = true"
    />

    <template v-else>
      <TurnBanner :mode="banner.mode" :text="banner.text" />

      <p v-if="lastError" class="mb-2 text-xs text-red-400">
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
        @pit-click="handlePitClick"
      />
    </template>

    <ConnectToast :status="status" @reconnect="reconnect" />
  </div>
</template>
