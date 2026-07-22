<template>
  <div v-if="pct > 0 || showZero" class="ac-progress">
    <div class="ac-progress-meta">
      <span>{{ label }}</span>
      <span>{{ display }}</span>
    </div>
    <div class="ac-progress-track">
      <div class="ac-progress-fill" :style="{ width: `${pct}%` }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { parseProgressPct, textOf } from '../../brief-utils';

const props = withDefaults(
  defineProps<{
    value?: unknown;
    label?: string;
    showZero?: boolean;
  }>(),
  { value: '', label: '进度', showZero: false },
);

const pct = computed(() => parseProgressPct(props.value));
const display = computed(() => textOf(props.value).trim() || `${pct.value}%`);
</script>
