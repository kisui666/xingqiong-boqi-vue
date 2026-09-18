<!--
  规则教程模态框：四节（走法/吃子/额外回合/终局）。
  首次访问由 App.vue 检测 localStorage 自动弹出，关闭后写 seen 标记。
  大厅"查看规则"按钮可随时调出。
-->
<script setup lang="ts">
defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const sections = [
  {
    title: '基本走法',
    body: '每方有 6 个坑位（各 4 颗棋子）+ 1 个计分坑。轮到你时，选定自己一侧的一个坑，将其全部棋子按逆时针方向逐颗播入后续坑位（跳过对方的计分坑）。最后落子在何处决定后续效果。',
  },
  {
    title: '吃子规则',
    body: '若最后一颗棋子正好落入自己一侧的空坑，则吃掉正对面（对方那一侧同列）坑中的全部棋子，连同刚才落入的最后一颗，一并收入自己的计分坑。若对面坑为空则不吃。',
  },
  {
    title: '额外回合',
    body: '若最后一颗棋子正好落入自己的计分坑，立即获得一次额外回合，可以再走一步。连续命中计分坑可连续额外回合。',
  },
  {
    title: '游戏结束',
    body: '当任一方 6 个坑位全部清空时，游戏结束。此时双方计分坑中的棋子即为最终得分，多者获胜；相同则为平局。',
  },
];
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-imaginary-purple/50 bg-space-black p-5 shadow-[0_0_30px_rgba(138,43,226,0.3)] md:p-6"
    >
      <h2 class="mb-4 text-center text-xl font-bold tracking-wide text-stellar-gold">
        星穹播棋 · 规则教程
      </h2>

      <div class="space-y-4">
        <div
          v-for="(s, i) in sections"
          :key="i"
          class="rounded-lg border border-gray-700 bg-gray-900/50 p-3"
        >
          <h3 class="mb-1.5 flex items-center gap-2 text-sm font-bold text-quantum-blue">
            <span class="flex h-5 w-5 items-center justify-center rounded-full bg-quantum-blue/20 text-xs">
              {{ i + 1 }}
            </span>
            {{ s.title }}
          </h3>
          <p class="text-xs leading-relaxed text-gray-300 md:text-sm">{{ s.body }}</p>
        </div>
      </div>

      <button
        class="mt-5 w-full rounded-lg border border-stellar-gold px-4 py-2.5 font-medium text-stellar-gold hover:bg-stellar-gold/15"
        @click="emit('close')"
      >
        我知道了
      </button>
    </div>
  </div>
</template>
