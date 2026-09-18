<!--
  角色详情底部抽屉（移动端友好）：完整被动+主动+注意事项。
  桌面端悬停也会触发显示（由父组件控制 visible）。
-->
<script setup lang="ts">
import type { Character } from '../characters/types';

defineProps<{
  character: Character | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'drawer-enter'): void;
  (e: 'drawer-leave'): void;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="visible && character"
        class="fixed inset-x-0 bottom-0 z-[70] mx-auto w-full max-w-2xl rounded-t-2xl border-t border-stellar-gold/50 bg-space-black p-4 shadow-[0_-4px_30px_rgba(212,175,55,0.25)]"
        @click.stop
        @mouseenter="emit('drawer-enter')"
        @mouseleave="emit('drawer-leave')"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-lg font-bold text-stellar-gold">
            {{ character.name }}
          </h3>
          <button
            class="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800"
            @click="emit('close')"
          >
            关闭 ✕
          </button>
        </div>

        <div class="space-y-2 text-xs text-gray-200">
          <div class="rounded bg-quantum-blue/10 p-2">
            <div class="mb-1 font-semibold text-quantum-blue">被动技能</div>
            <p>{{ character.passiveDesc }}</p>
          </div>

          <div v-if="character.activeName" class="rounded bg-imaginary-purple/10 p-2">
            <div class="mb-1 font-semibold text-imaginary-purple">
              主动：{{ character.activeName }}
            </div>
            <p>{{ character.activeDesc }}</p>
          </div>

          <div class="rounded bg-gray-800/40 p-2 text-gray-400">
            <div class="mb-1 font-semibold">注意事项</div>
            <ul class="list-inside list-disc space-y-0.5">
              <li>主动技能免费发动；多数每局限 1 次并代替本回合落子，具体以角色说明为准。</li>
              <li>缇宝传送后仍需落子，不消耗本回合行动。</li>
              <li>那刻夏·洞察为不限次数的免费提示，不消耗回合。</li>
              <li>那刻夏沉默阿格莱雅：对手为阿格莱雅时其被动+主动均失效。</li>
              <li>昔涟悔棋：恢复到上一回合开始状态，限 1 次。</li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
