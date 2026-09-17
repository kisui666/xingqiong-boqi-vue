<!--
  棋盘主体：左（对方计分坑）+ 中间两排坑位 + 右（己方计分坑）。
  视角翻转由 App.vue 传入的 topPits/bottomPits/myStore/oppStore 完成
  （host：己方 0..5 在下；guest：己方 7..12 在下），组件本身无视角逻辑。
  data-fly-overlay：GSAP 飞子动画的覆盖层（绝对定位，不拦截点击）。
-->
<script setup lang="ts">
import PitCell from './PitCell.vue';

defineProps<{
  /** 展示棋盘（动画期间逐格推进） */
  board: number[];
  /** 上排坑位索引（对方，按播种方向视觉序） */
  topPits: number[];
  /** 下排坑位索引（己方） */
  bottomPits: number[];
  myStore: number;
  oppStore: number;
  /** 坑位是否可点（useMatch.canClick） */
  canClick: (pitIndex: number) => boolean;
}>();

const emit = defineEmits<{ (e: 'pit-click', pitIndex: number): void }>();
</script>

<template>
  <div class="relative mx-auto w-full max-w-2xl">
    <div class="flex items-stretch gap-2 md:gap-3">
      <!-- 对方计分坑（左） -->
      <PitCell
        variant="store"
        :pit-index="oppStore"
        :count="board[oppStore]"
        :clickable="false"
      />

      <!-- 中间两排坑位 -->
      <div class="flex flex-1 flex-col gap-2 md:gap-3">
        <div class="grid grid-cols-6 gap-1.5 md:gap-2">
          <PitCell
            v-for="p in topPits"
            :key="p"
            :pit-index="p"
            :count="board[p]"
            :clickable="canClick(p)"
            @click="emit('pit-click', p)"
          />
        </div>
        <div class="grid grid-cols-6 gap-1.5 md:gap-2">
          <PitCell
            v-for="p in bottomPits"
            :key="p"
            :pit-index="p"
            :count="board[p]"
            :clickable="canClick(p)"
            @click="emit('pit-click', p)"
          />
        </div>
      </div>

      <!-- 己方计分坑（右） -->
      <PitCell
        variant="store"
        :pit-index="myStore"
        :count="board[myStore]"
        :clickable="false"
      />
    </div>

    <!-- 飞子动画覆盖层 -->
    <div data-fly-overlay class="pointer-events-none absolute inset-0 z-40" />
  </div>
</template>
