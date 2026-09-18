<!--
  回合横幅：玩家 0 回合 / 玩家 1 回合 / 额外回合！/ 游戏结束。
  - mode 'p0'：量子蓝（玩家 0 行动）
  - mode 'p1'：虚数紫（玩家 1 行动，含 AI / 对手）
  - mode 'extra'：星金无限闪烁
  - mode 'end'：星金
  文案由 App.vue 按 mode（Local/AI/Online）计算后传入。
-->
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import gsap from 'gsap';

const props = defineProps<{
  mode: 'p0' | 'p1' | 'extra' | 'end';
  text: string;
}>();

const el = ref<HTMLElement | null>(null);
let blink: gsap.core.Tween | null = null;

watch(
  () => props.mode,
  (m) => {
    blink?.kill();
    blink = null;
    if (el.value) gsap.set(el.value, { opacity: 1 });
    if (m === 'extra' && el.value) {
      blink = gsap.to(el.value, {
        opacity: 0.25,
        duration: 0.45,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
  },
  { immediate: true },
);

onUnmounted(() => blink?.kill());

const colorClass = computed(
  () =>
    ({
      p0: 'text-quantum-blue',
      p1: 'text-imaginary-purple',
      extra: 'text-stellar-gold',
      end: 'text-stellar-gold',
    })[props.mode],
);
</script>

<template>
  <div
    ref="el"
    class="mb-3 text-center text-xl font-bold tracking-wide md:text-2xl"
    :class="colorClass"
  >
    {{ text }}
  </div>
</template>
