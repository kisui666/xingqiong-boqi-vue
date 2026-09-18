<!--
  选人面板（Local 模式）：12 宫格 + 随机 + P1/P2 翻页遮罩 + 规则摘要。
  流程：P1 选 → 遮罩提示「请 P2 选择」→ P2 选 → 同屏展示双方角色 → 开局。
  选完后 emit('confirmed', [id, id])，由 App.vue 调 setChars + 进 in-game。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { CHARACTER_LIST } from '../characters';
import type { Character } from '../characters/types';
import CharCard from './CharCard.vue';
import CharDetailDrawer from './CharDetailDrawer.vue';

const emit = defineEmits<{
  (e: 'confirmed', chars: [string, string]): void;
  (e: 'back'): void;
}>();

type Phase = 'p1' | 'p2' | 'reveal';
const phase = ref<Phase>('p1');
const p1Choice = ref<string | null>(null);
const p2Choice = ref<string | null>(null);
const detailId = ref<string | null>(null);
const showDrawer = ref(false);
/** P2 阶段遮罩：点击「开始选人」才揭开的选人面板 */
const p2Ready = ref(false);

// —— 抽屉 hover-stay：鼠标在卡片区或抽屉内时保持打开 ——
const pointerInCards = ref(false);
const pointerInDrawer = ref(false);
let closeTimer: number | undefined;

function scheduleClose() {
  if (closeTimer) window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    if (!pointerInCards.value && !pointerInDrawer.value) {
      showDrawer.value = false;
    }
  }, 250);
}
function cancelClose() {
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    closeTimer = undefined;
  }
}

const currentChoice = computed(() =>
  phase.value === 'p1' ? p1Choice.value : p2Choice.value,
);

function selectChar(id: string) {
  if (phase.value === 'p1') {
    p1Choice.value = id;
  } else if (phase.value === 'p2') {
    p2Choice.value = id;
  }
}

function confirmChoice() {
  if (!currentChoice.value) return;
  if (phase.value === 'p1') {
    phase.value = 'p2';
    p2Ready.value = false;
  } else if (phase.value === 'p2') {
    phase.value = 'reveal';
  }
}

function randomSelect() {
  const used = new Set<string>();
  if (p1Choice.value) used.add(p1Choice.value);
  if (p2Choice.value) used.add(p2Choice.value);
  const pool = CHARACTER_LIST.filter((c) => !used.has(c.id));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick) selectChar(pick.id);
}

function showDetail(id: string) {
  cancelClose();
  detailId.value = id;
  showDrawer.value = true;
}

function onCardsEnter() {
  pointerInCards.value = true;
  cancelClose();
}
function onCardsLeave() {
  pointerInCards.value = false;
  scheduleClose();
}
function onDrawerEnter() {
  pointerInDrawer.value = true;
  cancelClose();
}
function onDrawerLeave() {
  pointerInDrawer.value = false;
  scheduleClose();
}
function closeDrawer() {
  cancelClose();
  showDrawer.value = false;
}

onBeforeUnmount(() => {
  if (closeTimer) window.clearTimeout(closeTimer);
});

const detailChar = computed<Character | null>(
  () => CHARACTER_LIST.find((c) => c.id === detailId.value) ?? null,
);

const p1Name = computed(
  () => CHARACTER_LIST.find((c) => c.id === p1Choice.value)?.name ?? '',
);
const p2Name = computed(
  () => CHARACTER_LIST.find((c) => c.id === p2Choice.value)?.name ?? '',
);

function startGame() {
  if (p1Choice.value && p2Choice.value) {
    emit('confirmed', [p1Choice.value, p2Choice.value]);
  }
}

function restart() {
  phase.value = 'p1';
  p1Choice.value = null;
  p2Choice.value = null;
  p2Ready.value = false;
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-3 px-4">
    <!-- 顶部规则摘要（常驻） -->
    <div class="rounded-lg border border-stellar-gold/30 bg-stellar-gold/5 p-2 text-[11px] text-gray-300">
      <span class="font-semibold text-stellar-gold">规则：</span>
      主动技能每局限 1 次 · 免费 · 发动后代替本回合落子（缇宝除外）
    </div>

    <!-- 阶段提示 -->
    <div class="text-center">
      <h2 v-if="phase === 'p1'" class="text-xl font-bold text-quantum-blue">
        玩家 1 选人
      </h2>
      <h2 v-else-if="phase === 'p2'" class="text-xl font-bold text-imaginary-purple">
        玩家 2 选人
      </h2>
      <h2 v-else class="text-xl font-bold text-stellar-gold">
        双方阵容
      </h2>
    </div>

    <!-- 选人阶段：12 宫格 -->
    <div v-if="phase !== 'reveal'" class="relative">
      <!-- P2 阶段遮罩提示（防偷看 P1 选择） -->
      <div
        v-if="phase === 'p2' && !p2Ready"
        class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-space-black/95"
      >
        <div class="text-center">
          <p class="mb-3 text-sm text-gray-300">请玩家 2 准备，点击开始选人</p>
          <button
            class="rounded-lg border border-imaginary-purple bg-imaginary-purple/20 px-6 py-2 text-imaginary-purple hover:bg-imaginary-purple/30"
            @click="p2Ready = true"
          >
            玩家 2 开始选人
          </button>
        </div>
      </div>

      <div
        class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6"
        @mouseenter="onCardsEnter"
        @mouseleave="onCardsLeave"
      >
        <CharCard
          v-for="c in CHARACTER_LIST"
          :key="c.id"
          :character="c"
          :selected="currentChoice === c.id"
          :disabled="false"
          @select="selectChar"
          @show-detail="showDetail"
        />
      </div>

      <div class="mt-3 flex items-center justify-between gap-2">
        <button
          class="rounded-lg border border-gray-600 px-4 py-2 text-xs text-gray-300 hover:bg-gray-800"
          @click="emit('back')"
        >
          ← 返回
        </button>
        <div class="flex gap-2">
          <button
            class="rounded-lg border border-quantum-blue px-4 py-2 text-xs text-quantum-blue hover:bg-quantum-blue/15"
            @click="randomSelect"
          >
            🎲 随机
          </button>
          <button
            class="rounded-lg border px-4 py-2 text-xs font-medium transition-colors"
            :class="
              currentChoice
                ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold hover:bg-stellar-gold/30'
                : 'border-gray-700 text-gray-500'
            "
            :disabled="!currentChoice"
            @click="confirmChoice"
          >
            {{ phase === 'p1' ? '确认 →' : '确认开局' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reveal 阶段：同屏展示双方角色 -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-lg border border-quantum-blue/50 bg-quantum-blue/10 p-4 text-center">
          <div class="text-xs text-gray-400">玩家 1</div>
          <div class="text-2xl font-bold text-quantum-blue">{{ p1Name }}</div>
        </div>
        <div class="rounded-lg border border-imaginary-purple/50 bg-imaginary-purple/10 p-4 text-center">
          <div class="text-xs text-gray-400">玩家 2</div>
          <div class="text-2xl font-bold text-imaginary-purple">{{ p2Name }}</div>
        </div>
      </div>
      <div class="flex justify-center gap-3">
        <button
          class="rounded-lg border border-gray-600 px-4 py-2 text-xs text-gray-300 hover:bg-gray-800"
          @click="restart"
        >
          重新选人
        </button>
        <button
          class="rounded-lg border border-stellar-gold bg-stellar-gold/20 px-6 py-2 text-sm font-bold text-stellar-gold hover:bg-stellar-gold/30"
          @click="startGame"
        >
          开始对局 →
        </button>
      </div>
    </div>

    <CharDetailDrawer
      :character="detailChar"
      :visible="showDrawer"
      @close="closeDrawer"
      @drawer-enter="onDrawerEnter"
      @drawer-leave="onDrawerLeave"
    />
  </div>
</template>
