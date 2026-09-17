<!--
  单个坑位/计分坑。
  - data-pit-index：GSAP 飞子动画的定位锚点（useMatch.flyStone 查询用）
  - V0.1 棋子以数字展示；可点时量子蓝高亮，禁用时置灰
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    pitIndex: number;
    count: number;
    clickable?: boolean;
    /** pit = 普通坑位；store = 计分坑（竖直长条） */
    variant?: 'pit' | 'store';
  }>(),
  { clickable: false, variant: 'pit' },
);

const emit = defineEmits<{ (e: 'click'): void }>();
</script>

<template>
  <button
    :data-pit-index="pitIndex"
    :disabled="!clickable"
    class="flex select-none items-center justify-center border"
    :class="
      variant === 'store'
        ? 'w-10 rounded-full border-imaginary-purple bg-imaginary-purple/10 md:w-14'
        : clickable
          ? 'aspect-square cursor-pointer rounded-2xl border-quantum-blue bg-quantum-blue/10 shadow-[0_0_10px_rgba(0,191,255,0.35)]'
          : 'aspect-square cursor-not-allowed rounded-2xl border-gray-600 bg-gray-800/40 opacity-50'
    "
    @click="emit('click')"
  >
    <span
      class="text-lg font-bold md:text-2xl"
      :class="
        clickable
          ? 'text-quantum-blue'
          : variant === 'store'
            ? 'text-stellar-gold'
            : 'text-gray-300'
      "
    >
      {{ count }}
    </span>
  </button>
</template>
