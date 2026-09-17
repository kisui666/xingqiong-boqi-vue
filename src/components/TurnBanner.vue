<!--
  回合横幅：你的回合 / 对方回合 / 额外回合！/ 游戏结束。
  额外回合 → GSAP 无限闪烁；模式切换时自动停止旧动画。
-->
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import gsap from 'gsap';

const props = defineProps<{
  mode: 'my' | 'opp' | 'extra' | 'end';
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
      my: 'text-quantum-blue',
      opp: 'text-gray-400',
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
