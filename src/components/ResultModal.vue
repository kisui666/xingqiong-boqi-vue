<!--
  终局结算模态框：最终比分 + 胜者标识 + 再来一局 / 返回大厅。
  背景蒙层拦截点击，卡片居中。
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId } from '../game/types';

const props = defineProps<{
  winner: PlayerId | null;
  score0: number;
  score1: number;
  label0: string;
  label1: string;
}>();

const emit = defineEmits<{
  (e: 'rematch'): void;
  (e: 'exit'): void;
}>();

const title = computed(() => {
  if (props.winner === null) return '平局！';
  return `${props.winner === 0 ? props.label0 : props.label1} 获胜！`;
});
</script>

<template>
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
  >
    <div
      class="w-full max-w-sm rounded-2xl border border-stellar-gold/50 bg-space-black p-6 text-center shadow-[0_0_30px_rgba(212,175,55,0.3)]"
    >
      <h2 class="mb-1 text-2xl font-bold tracking-wide text-stellar-gold">
        游戏结束
      </h2>
      <p class="mb-4 text-lg text-gray-100">{{ title }}</p>

      <div class="mb-5 flex items-center justify-center gap-4">
        <div class="text-center">
          <div class="text-xs text-gray-400">{{ label0 }}</div>
          <div class="text-3xl font-bold tabular-nums text-quantum-blue">
            {{ score0 }}
          </div>
        </div>
        <span class="text-gray-500">:</span>
        <div class="text-center">
          <div class="text-xs text-gray-400">{{ label1 }}</div>
          <div class="text-3xl font-bold tabular-nums text-imaginary-purple">
            {{ score1 }}
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <button
          class="w-full rounded-lg border border-stellar-gold bg-stellar-gold/15 px-4 py-2.5 font-medium text-stellar-gold hover:bg-stellar-gold/25"
          @click="emit('rematch')"
        >
          再来一局
        </button>
        <button
          class="w-full rounded-lg border border-gray-600 px-4 py-2.5 text-gray-300 hover:bg-gray-800"
          @click="emit('exit')"
        >
          返回大厅
        </button>
      </div>
    </div>
  </div>
</template>
