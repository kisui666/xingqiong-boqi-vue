<!--
  技能按钮（己方一侧）：三态显示。
  - 可用：高亮可点
  - 已用过：置灰显示「已使用」
  - 被那刻夏沉默：置灰（App.vue 额外显示封印文案）
-->
<script setup lang="ts">
import { computed } from 'vue';
import { getCharacter } from '../characters';

const props = defineProps<{
  charId: string;
  used: boolean;
  silenced: boolean;
  canUse: boolean;
}>();

const emit = defineEmits<{ (e: 'activate'): void }>();

const char = computed(() => getCharacter(props.charId));
const label = computed(() => char.value?.activeName ?? '技能');
</script>

<template>
  <button
    class="rounded-lg border px-3 py-2 text-xs font-medium transition-all"
    :class="
      props.used
        ? 'border-gray-700 bg-gray-800/40 text-gray-500'
        : props.silenced || !props.canUse
          ? 'border-gray-700 bg-gray-800/40 text-gray-600'
          : 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold shadow-[0_0_8px_rgba(212,175,55,0.3)] hover:bg-stellar-gold/30'
    "
    :disabled="props.used || props.silenced || !props.canUse"
    @click="emit('activate')"
  >
    <span v-if="props.used">已使用</span>
    <span v-else-if="props.silenced">🔒 {{ label }}（封印）</span>
    <span v-else>⚡ {{ label }}</span>
  </button>
</template>
