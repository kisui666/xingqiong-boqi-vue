<!--
  断线提示条：浮在页面顶部。
  disconnected → 「连接断开」+ 重连按钮；connecting（断线后）→ 「重连中...」；
  恢复 connected → 「连接已恢复」2 秒后自动消失。首次连接不弹提示。
-->
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

const props = defineProps<{
  status: 'idle' | 'connecting' | 'connected' | 'disconnected';
}>();

const emit = defineEmits<{ (e: 'reconnect'): void }>();

const visible = ref(false);
const msg = ref('');
const reconnecting = ref(false);
const recovered = ref(false);
let wasDisconnected = false;
let hideTimer: number | undefined;

watch(
  () => props.status,
  (s) => {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = undefined;
    }
    if (s === 'disconnected') {
      wasDisconnected = true;
      visible.value = true;
      msg.value = '连接断开';
      reconnecting.value = false;
      recovered.value = false;
    } else if (s === 'connecting') {
      if (wasDisconnected) {
        visible.value = true;
        msg.value = '重连中...';
        reconnecting.value = true;
      }
    } else if (s === 'connected') {
      reconnecting.value = false;
      if (wasDisconnected) {
        wasDisconnected = false;
        visible.value = true;
        msg.value = '连接已恢复';
        recovered.value = true;
        hideTimer = window.setTimeout(() => (visible.value = false), 2000);
      } else {
        visible.value = false;
      }
    }
  },
);

onUnmounted(() => {
  if (hideTimer) window.clearTimeout(hideTimer);
});
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 px-4 py-2 text-sm backdrop-blur"
    :class="recovered ? 'bg-emerald-900/80 text-emerald-200' : 'bg-red-900/80 text-red-200'"
  >
    <span>{{ msg }}</span>
    <button
      v-if="msg === '连接断开'"
      class="rounded border border-stellar-gold px-3 py-0.5 text-stellar-gold"
      @click="emit('reconnect')"
    >
      重新连接
    </button>
  </div>
</template>
