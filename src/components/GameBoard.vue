<!--
  棋盘主体：左（对方计分坑）+ 中间两排坑位 + 右（己方计分坑）。
  视角翻转由 App.vue 传入的 topPits/bottomPits/myStore/oppStore 完成。
  - bottomPlayer：当前在屏幕下方的玩家编号
  - activePlayer：当前行动方，用于行高亮（浅蓝 P0 / 浅橙 P1）
  - 非行动方区域 opacity-50
  data-fly-overlay：GSAP 飞子动画的覆盖层（绝对定位，不拦截点击）。
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId } from '../game/types';
import PitCell from './PitCell.vue';

const props = defineProps<{
  board: number[];
  topPits: number[];
  bottomPits: number[];
  myStore: number;
  oppStore: number;
  canClick: (pitIndex: number) => boolean;
  /** 屏幕下方玩家编号（视角锚点） */
  bottomPlayer: PlayerId;
  /** 当前行动方 */
  activePlayer: PlayerId;
}>();

const emit = defineEmits<{ (e: 'pit-click', pitIndex: number): void }>();

const topRowOwner = computed<PlayerId>(() =>
  props.bottomPlayer === 0 ? 1 : 0,
);
const bottomRowActive = computed(() => props.activePlayer === props.bottomPlayer);
const topRowActive = computed(() => !bottomRowActive.value);
const myStoreActive = computed(() => bottomRowActive.value);
const oppStoreActive = computed(() => topRowActive.value);
</script>

<template>
  <div class="relative mx-auto w-full max-w-2xl">
    <div class="flex items-stretch gap-2 md:gap-3">
      <!-- 对方计分坑（左） -->
      <PitCell
        variant="store"
        :pit-index="oppStore"
        :count="board[oppStore]"
        :owner="topRowOwner"
        :active="oppStoreActive"
        :clickable="false"
      />

      <!-- 中间两排坑位 -->
      <div class="flex flex-1 flex-col gap-2 md:gap-3">
        <div
          class="grid grid-cols-6 gap-1.5 rounded-lg p-1 transition-colors md:gap-2 md:p-1.5"
          :class="topRowActive ? 'bg-active-p1/10' : 'opacity-50'"
        >
          <PitCell
            v-for="p in topPits"
            :key="p"
            :pit-index="p"
            :count="board[p]"
            :owner="topRowOwner"
            :active="topRowActive"
            :clickable="canClick(p)"
            @click="emit('pit-click', p)"
          />
        </div>
        <div
          class="grid grid-cols-6 gap-1.5 rounded-lg p-1 transition-colors md:gap-2 md:p-1.5"
          :class="bottomRowActive ? 'bg-active-p0/10' : 'opacity-50'"
        >
          <PitCell
            v-for="p in bottomPits"
            :key="p"
            :pit-index="p"
            :count="board[p]"
            :owner="bottomPlayer"
            :active="bottomRowActive"
            :clickable="canClick(p)"
            @click="emit('pit-click', p)"
          />
        </div>
      </div>

      <!-- 己方计分坑（右） -->
      <PitCell
        variant="store"
        :pit-index="myStore"
        :count="board[myStore]"
        :owner="bottomPlayer"
        :active="myStoreActive"
        :clickable="false"
      />
    </div>

    <!-- 飞子动画覆盖层 -->
    <div data-fly-overlay class="pointer-events-none absolute inset-0 z-40" />
  </div>
</template>
