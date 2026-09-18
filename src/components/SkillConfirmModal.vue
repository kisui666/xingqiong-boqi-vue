<!--
  技能二次确认弹窗：显示技能名 + 目标坑选择 + 沙盘预览（播种后分布）。
  支持的角色按需显示目标坑选择器与方向选择器（缇宝）。
  确认后 emit('confirm', { pit, targetPit, direction })。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getCharacter } from '../characters';
import { PITS } from '../game/constants';
import type { PlayerId } from '../game/types';

const props = defineProps<{
  visible: boolean;
  charId: string;
  player: PlayerId;
  /** 当前 board（12 元素）用于预览计算 */
  board: number[];
  /** 预览函数：传入 pit/targetPit/direction 返回预览后的 14 元素视图 */
  preview: (pit: number, targetPit: number | undefined, direction: 'cw' | 'ccw' | undefined) => number[];
}>();

const emit = defineEmits<{
  (e: 'confirm', payload: { pit: number; targetPit?: number; direction?: 'cw' | 'ccw' }): void;
  (e: 'cancel'): void;
}>();

const char = computed(() => getCharacter(props.charId));

// 角色需要的参数模式
type ParamMode = 'none' | 'own-pit' | 'opp-pit' | 'two-own-pits' | 'own-pit-with-direction' | 'own-or-opp-pit' | 'row';
const paramMode = computed<ParamMode>(() => {
  const id = props.charId;
  switch (id) {
    case 'baie': return 'own-pit';
    case 'wandi': return 'own-pit';
    case 'aglaiya': return 'two-own-pits';
    case 'tibao': return 'own-pit-with-direction';
    case 'xiadie': return 'opp-pit';
    case 'nakkari': return 'none';
    case 'fengqin': return 'own-pit';
    case 'saifeier': return 'opp-pit';
    case 'haiseyin': return 'row';
    case 'kelvdelu': return 'none';
    case 'changyueyue': return 'opp-pit';
    case 'danheng': return 'own-pit';
    case 'xilian': return 'none';
    default: return 'none';
  }
});

const ownPits = computed(() => PITS[props.player]);
const oppPits = computed(() => PITS[props.player === 0 ? 1 : 0]);

const selectedPit = ref<number>(0);
const selectedTarget = ref<number | undefined>(undefined);
const selectedDirection = ref<'cw' | 'ccw'>('ccw');

// 弹窗打开时重置选择
watch(
  () => props.visible,
  (v) => {
    if (v) {
      selectedPit.value = ownPits.value.find((p) => props.board[p] > 0) ?? ownPits.value[0];
      selectedTarget.value = undefined;
      selectedDirection.value = 'ccw';
    }
  },
);

const previewBoard = computed(() => {
  if (!props.visible) return [];
  return props.preview(
    selectedPit.value,
    selectedTarget.value,
    paramMode.value === 'own-pit-with-direction' ? selectedDirection.value : undefined,
  );
});

function confirm() {
  const mode = paramMode.value;
  const payload: { pit: number; targetPit?: number; direction?: 'cw' | 'ccw' } = {
    pit: selectedPit.value,
  };
  if (mode === 'two-own-pits' || mode === 'own-pit-with-direction' || mode === 'opp-pit' || mode === 'row' || mode === 'own-or-opp-pit') {
    payload.targetPit = selectedTarget.value;
  }
  if (mode === 'own-pit-with-direction') {
    payload.direction = selectedDirection.value;
  }
  emit('confirm', payload);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && char"
      class="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      @click.self="emit('cancel')"
    >
      <div class="w-full max-w-md rounded-2xl border border-stellar-gold/50 bg-space-black p-5 shadow-[0_0_30px_rgba(212,175,55,0.3)]">
        <h3 class="mb-1 text-center text-lg font-bold text-stellar-gold">
          {{ char.activeName }}
        </h3>
        <p class="mb-3 text-center text-xs text-gray-400">{{ char.activeDesc }}</p>

        <!-- 参数选择 -->
        <div v-if="paramMode === 'own-pit'" class="mb-3">
          <div class="mb-1 text-xs text-gray-300">选择己方坑：</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="p in ownPits"
              :key="p"
              class="rounded border px-2 py-1 text-xs"
              :class="selectedPit === p ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold' : 'border-gray-600 text-gray-300'"
              :disabled="board[p] === 0"
              @click="selectedPit = p"
            >
              坑{{ p }} ({{ board[p] }})
            </button>
          </div>
        </div>

        <div v-else-if="paramMode === 'two-own-pits'" class="mb-3 space-y-2">
          <div>
            <div class="mb-1 text-xs text-gray-300">源坑：</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="p in ownPits"
                :key="p"
                class="rounded border px-2 py-1 text-xs"
                :class="selectedPit === p ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold' : 'border-gray-600 text-gray-300'"
                @click="selectedPit = p"
              >
                坑{{ p }} ({{ board[p] }})
              </button>
            </div>
          </div>
          <div>
            <div class="mb-1 text-xs text-gray-300">目标坑：</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="p in ownPits"
                :key="p"
                class="rounded border px-2 py-1 text-xs"
                :class="selectedTarget === p ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold' : 'border-gray-600 text-gray-300'"
                :disabled="p === selectedPit"
                @click="selectedTarget = p"
              >
                坑{{ p }} ({{ board[p] }})
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="paramMode === 'opp-pit'" class="mb-3">
          <div class="mb-1 text-xs text-gray-300">选择对手坑：</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="p in oppPits"
              :key="p"
              class="rounded border px-2 py-1 text-xs"
              :class="selectedTarget === p ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold' : 'border-gray-600 text-gray-300'"
              :disabled="board[p] === 0"
              @click="selectedTarget = p"
            >
              坑{{ p }} ({{ board[p] }})
            </button>
          </div>
        </div>

        <div v-else-if="paramMode === 'own-pit-with-direction'" class="mb-3 space-y-2">
          <div>
            <div class="mb-1 text-xs text-gray-300">源坑（传送）：</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="p in ownPits"
                :key="p"
                class="rounded border px-2 py-1 text-xs"
                :class="selectedPit === p ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold' : 'border-gray-600 text-gray-300'"
                :disabled="board[p] === 0"
                @click="selectedPit = p"
              >
                坑{{ p }} ({{ board[p] }})
              </button>
            </div>
          </div>
          <div>
            <div class="mb-1 text-xs text-gray-300">目标坑：</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="p in ownPits"
                :key="p"
                class="rounded border px-2 py-1 text-xs"
                :class="selectedTarget === p ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold' : 'border-gray-600 text-gray-300'"
                :disabled="p === selectedPit"
                @click="selectedTarget = p"
              >
                坑{{ p }} ({{ board[p] }})
              </button>
            </div>
          </div>
          <div>
            <div class="mb-1 text-xs text-gray-300">方向：</div>
            <div class="flex gap-2">
              <button
                v-for="d in (['ccw', 'cw'] as const)"
                :key="d"
                class="rounded border px-3 py-1 text-xs"
                :class="selectedDirection === d ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold' : 'border-gray-600 text-gray-300'"
                @click="selectedDirection = d"
              >
                {{ d === 'ccw' ? '逆时针' : '顺时针' }}
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="paramMode === 'row'" class="mb-3">
          <div class="mb-1 text-xs text-gray-300">选择行：</div>
          <div class="flex gap-2">
            <button
              v-for="r in ([0, 1] as const)"
              :key="r"
              class="rounded border px-3 py-1 text-xs"
              :class="selectedTarget === r ? 'border-stellar-gold bg-stellar-gold/20 text-stellar-gold' : 'border-gray-600 text-gray-300'"
              @click="selectedTarget = r"
            >
              {{ r === 0 ? '己方行' : '对手行' }}
            </button>
          </div>
        </div>

        <!-- 沙盘预览 -->
        <div v-if="previewBoard.length" class="mb-3 rounded bg-gray-900/60 p-2">
          <div class="mb-1 text-[10px] text-gray-400">预览（技能结算后分布）：</div>
          <div class="flex flex-wrap gap-1 text-[10px]">
            <span
              v-for="(n, i) in previewBoard"
              :key="i"
              class="rounded bg-gray-800 px-1.5 py-0.5 tabular-nums text-gray-300"
            >
              {{ i === 6 ? `仓0:${n}` : i === 13 ? `仓1:${n}` : `坑${i < 6 ? i : i - 1}:${n}` }}
            </span>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button
            class="rounded-lg border border-gray-600 px-4 py-2 text-xs text-gray-300 hover:bg-gray-800"
            @click="emit('cancel')"
          >
            取消
          </button>
          <button
            class="rounded-lg border border-stellar-gold bg-stellar-gold/20 px-4 py-2 text-xs font-medium text-stellar-gold hover:bg-stellar-gold/30"
            @click="confirm"
          >
            确认发动
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
