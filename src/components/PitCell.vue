<!--
  单个坑位/计分坑。
  - data-pit-index：GSAP 飞子动画的定位锚点（useMoveAnimation 查询用）
  - owner：该坑所属玩家（0 / 1），用于回合高亮底色
  - active：该坑所属玩家是否为当前行动方（影响底色与透明度）
  - clickable：可点击时量子蓝高亮发光（优先级最高）
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId } from '../game/types';

const props = withDefaults(
  defineProps<{
    pitIndex: number;
    count: number;
    clickable?: boolean;
    variant?: 'pit' | 'store';
    owner?: PlayerId;
    active?: boolean;
    /** 那刻夏洞察推荐落点 */
    hint?: boolean;
  }>(),
  { clickable: false, variant: 'pit', owner: 0 as PlayerId, active: false, hint: false },
);

const emit = defineEmits<{ (e: 'click'): void }>();

const containerCls = computed(() => {
  if (props.variant === 'store') {
    return props.active
      ? 'w-10 rounded-full border-stellar-gold bg-stellar-gold/15 md:w-14'
      : 'w-10 rounded-full border-imaginary-purple bg-imaginary-purple/10 md:w-14';
  }
  // 洞察推荐落点：星金色脉冲高亮（优先级最高，覆盖 clickable）
  if (props.hint) {
    return 'aspect-square animate-pulse cursor-pointer rounded-2xl border-stellar-gold bg-stellar-gold/25 shadow-[0_0_14px_rgba(212,175,55,0.7)]';
  }
  // 普通坑
  if (props.clickable) {
    return 'aspect-square cursor-pointer rounded-2xl border-quantum-blue bg-quantum-blue/15 shadow-[0_0_10px_rgba(0,191,255,0.35)]';
  }
  if (props.active) {
    return props.owner === 0
      ? 'aspect-square cursor-not-allowed rounded-2xl border-active-p0 bg-active-p0/30'
      : 'aspect-square cursor-not-allowed rounded-2xl border-active-p1 bg-active-p1/30';
  }
  return 'aspect-square cursor-not-allowed rounded-2xl border-gray-600 bg-gray-800/40 opacity-40';
});

const textCls = computed(() => {
  if (props.hint) return 'text-stellar-gold';
  if (props.clickable) return 'text-quantum-blue';
  if (props.variant === 'store') return 'text-stellar-gold';
  if (props.active) {
    return props.owner === 0 ? 'text-blue-200' : 'text-orange-200';
  }
  return 'text-gray-300';
});
</script>

<template>
  <button
    :data-pit-index="pitIndex"
    :disabled="!clickable"
    class="flex select-none items-center justify-center border transition-colors"
    :class="containerCls"
    @click="emit('click')"
  >
    <span class="text-lg font-bold md:text-2xl" :class="textCls">
      {{ count }}
    </span>
  </button>
</template>
