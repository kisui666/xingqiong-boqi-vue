<!--
  模式选择面板：三张大卡片（本地双人 / 人机对战 / 在线联机）。
  人机卡片内嵌 easy/medium 难度切换；底部"查看规则"按钮。
  纯展示 + 事件上报，模式切换由 App.vue 经 useMatch 完成。
-->
<script setup lang="ts">
import { ref } from 'vue';
import type { AiDifficulty } from '../game/ai';

const emit = defineEmits<{
  (e: 'select-local'): void;
  (e: 'select-ai', difficulty: AiDifficulty): void;
  (e: 'select-online'): void;
  (e: 'show-rules'): void;
}>();

const aiDifficulty = ref<AiDifficulty>('medium');

const modes = [
  {
    key: 'local' as const,
    title: '本地双人',
    desc: '同一设备轮流落子',
    border: 'border-quantum-blue',
    text: 'text-quantum-blue',
    bg: 'bg-quantum-blue/10',
    hover: 'hover:bg-quantum-blue/20',
  },
  {
    key: 'ai' as const,
    title: '人机对战',
    desc: '挑战 AI（可调难度）',
    border: 'border-stellar-gold',
    text: 'text-stellar-gold',
    bg: 'bg-stellar-gold/10',
    hover: 'hover:bg-stellar-gold/20',
  },
  {
    key: 'online' as const,
    title: '在线联机',
    desc: '建房 / 加入房间',
    border: 'border-imaginary-purple',
    text: 'text-imaginary-purple',
    bg: 'bg-imaginary-purple/10',
    hover: 'hover:bg-imaginary-purple/20',
  },
];
</script>

<template>
  <div class="mx-auto w-full max-w-md space-y-5 px-4">
    <h1 class="text-center text-3xl font-bold tracking-[0.2em] text-stellar-gold">
      星穹播棋
    </h1>
    <p class="text-center text-xs text-gray-400">选择对战模式</p>

    <div class="space-y-3">
      <button
        v-for="m in modes"
        :key="m.key"
        class="w-full rounded-xl border p-4 text-left transition-colors"
        :class="[m.border, m.bg, m.hover]"
        @click="
          m.key === 'local'
            ? emit('select-local')
            : m.key === 'ai'
              ? emit('select-ai', aiDifficulty)
              : emit('select-online')
        "
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="text-lg font-bold" :class="m.text">{{ m.title }}</div>
            <div class="text-xs text-gray-400">{{ m.desc }}</div>
          </div>
          <span class="text-2xl text-gray-600">›</span>
        </div>

        <!-- 人机模式：内嵌难度选择 -->
        <div
          v-if="m.key === 'ai'"
          class="mt-3 flex gap-2"
          @click.stop
        >
          <button
            v-for="d in (['easy', 'medium'] as AiDifficulty[])"
            :key="d"
            class="rounded-lg border px-3 py-1 text-xs transition-colors"
            :class="
              aiDifficulty === d
                ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold'
                : 'border-gray-600 text-gray-400 hover:bg-gray-800'
            "
            @click.stop="aiDifficulty = d"
          >
            {{ d === 'easy' ? '简单' : '中等' }}
          </button>
        </div>
      </button>
    </div>

    <button
      class="w-full rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
      @click="emit('show-rules')"
    >
      查看规则
    </button>
  </div>
</template>
