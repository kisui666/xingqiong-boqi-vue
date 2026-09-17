<!--
  大厅面板：建房 / 加入 / 邀请链接 / 连接状态。
  纯展示 + 事件上报，P2P 动作由 App.vue 经 useMatch 完成。
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{
  status: 'idle' | 'connecting' | 'connected' | 'disconnected';
  error: string | null;
  /** 创建房间后返回的 6 位房间号（null = 尚未创建） */
  createdRoom: string | null;
}>();

const emit = defineEmits<{
  (e: 'create'): void;
  (e: 'join', room: string): void;
  (e: 'connected'): void;
}>();

const roomInput = ref('');
const copied = ref(false);

const STATUS_TEXT: Record<string, string> = {
  idle: '待机',
  connecting: '连接中...',
  connected: '已连接',
  disconnected: '已断开',
};

// 通过邀请链接进入：?room=XXXXXX 自动填入输入框
onMounted(() => {
  const r = new URLSearchParams(location.search).get('room');
  if (r) roomInput.value = r.toUpperCase();
});

// 连接成功 → 通知 App 切到对局视图
watch(
  () => props.status,
  (s) => {
    if (s === 'connected') emit('connected');
  },
);

async function copyInvite() {
  if (!props.createdRoom) return;
  const link = `${location.origin}${location.pathname}?room=${props.createdRoom}`;
  await navigator.clipboard.writeText(link);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <div class="mx-auto mt-10 w-full max-w-sm space-y-5">
    <h1 class="text-center text-2xl font-bold tracking-widest text-stellar-gold">
      星穹播棋
    </h1>

    <div class="text-center text-sm text-gray-400">
      连接状态：
      <span
        :class="
          status === 'connected'
            ? 'text-quantum-blue'
            : status === 'disconnected'
              ? 'text-red-400'
              : 'text-gray-300'
        "
      >{{ STATUS_TEXT[status] }}</span>
    </div>

    <p v-if="error" class="text-center text-sm text-red-400">{{ error }}</p>

    <!-- 创建结果：大字房间号 + 复制邀请链接 -->
    <div
      v-if="createdRoom"
      class="space-y-2 rounded-xl border border-imaginary-purple/50 bg-imaginary-purple/10 p-4 text-center"
    >
      <div class="text-xs text-gray-400">房间号（发给对手）</div>
      <div class="text-4xl font-bold tracking-[0.3em] text-stellar-gold">
        {{ createdRoom }}
      </div>
      <button
        class="w-full rounded-lg border border-stellar-gold px-3 py-2 text-sm text-stellar-gold hover:bg-stellar-gold/10"
        @click="copyInvite"
      >
        {{ copied ? '已复制' : '复制邀请链接' }}
      </button>
    </div>

    <div class="space-y-3">
      <button
        :disabled="status === 'connecting'"
        class="w-full rounded-lg border border-quantum-blue bg-quantum-blue/10 px-3 py-2.5 text-quantum-blue disabled:opacity-40"
        @click="emit('create')"
      >
        创建房间（先手）
      </button>

      <div class="flex gap-2">
        <input
          v-model="roomInput"
          maxlength="6"
          placeholder="输入 6 位房间号"
          class="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-center uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal"
        />
        <button
          :disabled="status === 'connecting' || roomInput.length !== 6"
          class="rounded-lg border border-quantum-blue px-4 py-2 text-quantum-blue disabled:opacity-40"
          @click="emit('join', roomInput)"
        >
          加入房间
        </button>
      </div>
    </div>
  </div>
</template>
