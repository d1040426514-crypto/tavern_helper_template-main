<template>
  <article class="ac-plot-card">
    <header class="ac-plot-card-head">
      <h5 class="ac-plot-card-title">⚔️ {{ name }}</h5>
      <div class="ac-chip-row">
        <span v-if="roles" class="ac-meta-chip">👤 {{ roles }}</span>
        <span v-if="groups" class="ac-meta-chip">🏛️ {{ groups }}</span>
      </div>
    </header>

    <div v-if="settle" class="ac-plot-settle">
      <span class="ac-plot-settle-label">结算条件</span>
      <span class="ac-plot-settle-value">{{ settle }}</span>
    </div>

    <div v-if="hasOracle" class="ac-oracle-grid">
      <div v-if="macro" class="ac-oracle-cell">
        <div class="ac-oracle-label">宏观层</div>
        <div class="ac-oracle-value">{{ macro }}</div>
      </div>
      <div v-if="develop" class="ac-oracle-cell">
        <div class="ac-oracle-label">发展层</div>
        <div class="ac-oracle-value">{{ develop }}</div>
      </div>
      <div v-if="detail" class="ac-oracle-cell">
        <div class="ac-oracle-label">细节层</div>
        <div class="ac-oracle-value">{{ detail }}</div>
      </div>
    </div>

    <div v-if="timeline.length" class="ac-plot-timeline">
      <div class="ac-kv-key">事件脉络</div>
      <div v-for="[date, desc] in timeline" :key="date" class="ac-timeline-node">
        <div class="ac-timeline-node-head">
          <strong>{{ date }}</strong>
        </div>
        <div class="ac-timeline-node-line">{{ textOf(desc) }}</div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { isNonEmptyText, textOf, timelineEntries } from '../../brief-utils';

const props = defineProps<{
  name: string;
  node?: Record<string, any> | null;
}>();

const roles = computed(() => textOf(props.node?.参与角色).trim());
const groups = computed(() => textOf(props.node?.牵涉团体).trim());
const settle = computed(() => textOf(props.node?.结算条件).trim());
const guidance = computed(() => props.node?.叙事指导 as Record<string, any> | undefined);
const macro = computed(() => textOf(guidance.value?.宏观层).trim());
const develop = computed(() => textOf(guidance.value?.发展层).trim());
const detail = computed(() => textOf(guidance.value?.细节层).trim());
const hasOracle = computed(
  () => isNonEmptyText(macro.value) || isNonEmptyText(develop.value) || isNonEmptyText(detail.value),
);
const timeline = computed(() => timelineEntries(props.node?.事件脉络));
</script>
