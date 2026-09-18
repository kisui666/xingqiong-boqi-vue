<!--
  角色卡片：12 宫格中的单张卡片。
  显示：角色名 + 被动一句话 + 主动名+一句话。
  点击卡片：触发详情抽屉；选中态有边框高亮。
-->
<script setup lang="ts">
import type { Character } from '../characters/types';

const props = defineProps<{
  character: Character;
  selected: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'show-detail', id: string): void;
}>();
</script>

<template>
  <button
    class="flex flex-col rounded-lg border p-2 text-left transition-all"
    :class="[
      props.selected
        ? 'border-stellar-gold bg-stellar-gold/15 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
        : props.disabled
          ? 'border-gray-700 opacity-40'
          : 'border-imaginary-purple/40 bg-imaginary-purple/5 hover:bg-imaginary-purple/15',
    ]"
    :disabled="props.disabled"
    @click="emit('select', props.character.id)"
    @mouseenter="emit('show-detail', props.character.id)"
    @focus="emit('show-detail', props.character.id)"
  >
    <div class="mb-1 text-sm font-bold text-stellar-gold">
      {{ props.character.name }}
    </div>
    <div class="mb-1 text-[10px] leading-tight text-gray-300">
      <span class="text-quantum-blue">被动：</span>
      {{ props.character.passiveDesc }}
    </div>
    <div class="text-[10px] leading-tight text-gray-300">
      <span class="text-imaginary-purple">主动：</span>
      {{ props.character.activeName ?? '—' }} ·
      {{ props.character.activeDesc ?? '—' }}
    </div>
  </button>
</template>
