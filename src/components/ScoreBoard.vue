<!--
  实时比分板：双列展示双方计分坑棋子数。
  activePlayer 一侧加金色边框 + 发光，提示当前行动方。
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId } from '../game/types';

const props = defineProps<{
  score0: number;
  score1: number;
  label0: string;
  label1: string;
  /** 当前行动方，用于高亮 */
  activePlayer: PlayerId;
}>();

const leftActive = computed(() => props.activePlayer === 0);
const rightActive = computed(() => props.activePlayer === 1);
</script>

<template>
  <div class="mx-auto mb-3 flex w-full max-w-2xl items-stretch gap-2 md:gap-3">
    <!-- 玩家 0 -->
    <div
      class="flex flex-1 items-center justify-between rounded-xl border px-3 py-2 transition-colors md:px-4"
      :class="
        leftActive
          ? 'border-stellar-gold bg-stellar-gold/15 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
          : 'border-gray-700 bg-gray-900/60 opacity-60'
      "
    >
      <span class="text-xs text-gray-300 md:text-sm">{{ label0 }}</span>
      <span
        class="text-2xl font-bold tabular-nums md:text-3xl"
        :class="leftActive ? 'text-stellar-gold' : 'text-gray-400'"
      >{{ score0 }}</span>
    </div>

    <span class="self-center text-xs text-gray-500">VS</span>

    <!-- 玩家 1 -->
    <div
      class="flex flex-1 items-center justify-between rounded-xl border px-3 py-2 transition-colors md:px-4"
      :class="
        rightActive
          ? 'border-stellar-gold bg-stellar-gold/15 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
          : 'border-gray-700 bg-gray-900/60 opacity-60'
      "
    >
      <span
        class="text-2xl font-bold tabular-nums md:text-3xl"
        :class="rightActive ? 'text-stellar-gold' : 'text-gray-400'"
      >{{ score1 }}</span>
      <span class="text-xs text-gray-300 md:text-sm">{{ label1 }}</span>
    </div>
  </div>
</template>
