<template>
  <div class="npc-card" :class="{ 'npc-card--empty': npc.empty }">
    <!-- 顶栏：头像 + 名字 | 声誉 | 资金 -->
    <div class="npc-card-top">
      <div class="npc-avatar" aria-hidden="true">🌟</div>
      <div class="npc-name">
        <span class="npc-name-icon">💠</span>
        {{ npc.name }}
      </div>
      <div v-if="npc.reputation.length" class="npc-rep-inline" title="声誉">
        <span v-for="(r, i) in npc.reputation" :key="'rep' + i" class="npc-chip npc-chip--rep">
          <template v-if="r.label">[{{ r.label }}]</template>{{ r.value }}
        </span>
      </div>
      <span v-if="npc.wealth" class="npc-wealth-tag" :class="wealthCls">
        {{ wealthEmoji }} {{ npc.wealth }}
      </span>
      <span v-else-if="npc.empty" class="npc-wealth-tag wealth-balanced">暂无行动数据</span>
    </div>

    <!-- 行为链紧贴名字下方 -->
    <div v-if="npc.actionChain.length || npc.predict" class="npc-chain-section">
      <div class="chain-label">⚡ 行为链</div>
      <div class="chain-flow">
        <template v-for="(step, i) in npc.actionChain" :key="'a' + i">
          <span v-if="i > 0" class="chain-arrow">→</span>
          <span class="chain-step">{{ step }}</span>
        </template>
        <template v-if="npc.predict">
          <span class="chain-arrow">→</span>
          <span class="chain-predict">后续: {{ npc.predict }}</span>
        </template>
        <span v-if="npc.debutReady" class="chain-debut-tag">⚡准备登场</span>
      </div>
    </div>

    <!-- 当前状态：标签在上、内容在下的信息格；「正在做」可通栏 -->
    <section v-if="statusCells.length" class="npc-section">
      <header class="npc-section-head">📍 当前状态</header>
      <div class="npc-status-grid" :class="{ 'has-doing': !!doingCell }">
        <div v-for="cell in statusMainCells" :key="cell.label" class="npc-status-cell">
          <div class="npc-status-k">{{ cell.label }}</div>
          <div class="npc-status-v">{{ cell.value }}</div>
        </div>
        <div v-if="doingCell" class="npc-status-cell npc-status-cell--doing">
          <div class="npc-status-k">{{ doingCell.label }}</div>
          <div class="npc-status-v">{{ doingCell.value }}</div>
        </div>
      </div>
    </section>

    <!-- 社交 / 背景：并排双卡，窄屏堆叠 -->
    <div v-if="npc.socialNetwork.length || showBackgroundCard" class="npc-duo">
      <article v-if="npc.socialNetwork.length" class="npc-subcard">
        <header class="npc-subcard-head">🤝 社交网络</header>
        <div class="npc-subcard-body">
          <div v-for="(g, gi) in npc.socialNetwork" :key="'soc' + gi" class="npc-social-row">
            <span class="npc-social-cat">{{ g.category }}</span>
            <div class="npc-social-people">
              <div v-for="(p, pi) in g.people" :key="'p' + gi + '-' + pi" class="npc-person">
                <span class="npc-person-name">{{ p.name }}</span>
                <span v-if="p.note" class="npc-person-note">{{ p.note }}</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article v-if="showBackgroundCard" class="npc-subcard">
        <header class="npc-subcard-head">🔗 背景关联</header>
        <div class="npc-subcard-body npc-bg-rows">
          <div v-for="row in backgroundRows" :key="row.key" class="npc-bg-row">
            <span class="npc-bg-key">{{ row.label }}</span>
            <span class="npc-bg-val" :class="{ muted: row.empty }">{{ row.value }}</span>
          </div>
        </div>
      </article>
    </div>

    <!-- 长期目标 / 近期打算：并排双卡；近期按 事件|行为|时段 拆行 -->
    <div v-if="npc.longGoal || npc.nearPlan.length" class="npc-duo">
      <article v-if="npc.longGoal" class="npc-subcard">
        <header class="npc-subcard-head">🎯 长期目标</header>
        <p class="npc-goal-text">{{ npc.longGoal }}</p>
      </article>
      <article v-if="npc.nearPlan.length" class="npc-subcard">
        <header class="npc-subcard-head">📅 近期打算</header>
        <div class="npc-subcard-body npc-bg-rows">
          <div v-for="row in nearPlanRows" :key="row.key" class="npc-bg-row">
            <span class="npc-bg-key">{{ row.label }}</span>
            <span class="npc-bg-val">{{ row.value }}</span>
          </div>
        </div>
      </article>
    </div>

    <!-- 记忆：三类等宽栏，统一列表样式 -->
    <section v-if="memoryColumns.length" class="npc-section npc-memory-section">
      <header class="npc-section-head">🧠 记忆</header>
      <div
        class="npc-memory-grid"
        :style="{ '--mem-cols': String(memoryColumns.length) }"
      >
        <article
          v-for="col in memoryColumns"
          :key="col.key"
          class="npc-memory-col"
          :class="'npc-memory-col--' + col.key"
        >
          <header class="npc-memory-col-head">
            <span>{{ col.icon }}</span>
            <span>{{ col.title }}</span>
            <span class="npc-memory-count">{{ col.items.length }}</span>
          </header>
          <ol class="npc-memory-list">
            <li v-for="(m, i) in col.items" :key="col.key + i">{{ m }}</li>
          </ol>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { getWealthClass, getWealthEmoji } from '../parse';
import { STATUS_LABELS, type NpcCard } from '../types';

const props = defineProps<{ npc: NpcCard }>();

const statusLabels = STATUS_LABELS;
const wealthCls = computed(() => getWealthClass(props.npc.wealth));
const wealthEmoji = computed(() => getWealthEmoji(props.npc.wealth));

const statusCells = computed(() =>
  props.npc.statusParts.map((value, i) => ({
    label: statusLabels[i] || `详情${i + 1}`,
    value,
  })),
);

const statusMainCells = computed(() =>
  statusCells.value.filter(c => c.label !== '正在做'),
);

const doingCell = computed(() => statusCells.value.find(c => c.label === '正在做') ?? null);

const NEAR_PLAN_LABELS = ['事件', '行为', '时段'] as const;

const nearPlanRows = computed(() => {
  const parts = props.npc.nearPlan;
  if (!parts.length) return [];
  if (parts.length === 1) {
    return [{ key: 'plan', label: '内容', value: parts[0]! }];
  }
  return parts.map((value, i) => ({
    key: `p${i}`,
    label: NEAR_PLAN_LABELS[i] ?? `项${i + 1}`,
    value,
  }));
});

const memoryColumns = computed(() => {
  const cols: Array<{ key: string; title: string; icon: string; items: string[] }> = [];
  if (props.npc.recentMemories.length) {
    cols.push({ key: 'recent', title: '近期记忆', icon: '💬', items: props.npc.recentMemories });
  }
  if (props.npc.settledMemories.length) {
    cols.push({ key: 'settled', title: '沉淀记忆', icon: '📜', items: props.npc.settledMemories });
  }
  if (props.npc.coreMemories.length) {
    cols.push({ key: 'core', title: '核心记忆', icon: '💎', items: props.npc.coreMemories });
  }
  return cols;
});

function bgDisplay(v: string): { value: string; empty: boolean } {
  const t = String(v ?? '').trim();
  if (!t || t === '无') return { value: '无', empty: true };
  return { value: t, empty: false };
}

const showBackgroundCard = computed(() => {
  const b = props.npc.background;
  return !!(b.group || b.circle || b.event);
});

const backgroundRows = computed(() => {
  const b = props.npc.background;
  const g = bgDisplay(b.group);
  const c = bgDisplay(b.circle);
  const e = bgDisplay(b.event);
  return [
    { key: 'group', label: '团体', ...g },
    { key: 'circle', label: '社交圈', ...c },
    { key: 'event', label: '事件', ...e },
  ];
});
</script>

<style lang="scss" scoped>
.npc-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--card-pad);
  box-shadow: var(--glow-card);
  transition:
    background var(--transition-smooth),
    border-color var(--transition-smooth),
    box-shadow var(--transition-smooth);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.45em;
  min-width: 0;
  width: 100%;
  font-size: 1em;

  &:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-glow);
    box-shadow: var(--glow-accent);
  }

  &--empty {
    opacity: 0.78;
  }
}

/* 顶栏：名字靠左，声誉与资金靠右对齐同一行 */
.npc-card-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35em 0.5em;
  position: relative;
  z-index: 1;
  width: 100%;
}

.npc-avatar {
  width: 1.75em;
  height: 1.75em;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--bg-step), rgba(140, 170, 210, 0.18));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85em;
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
}

.npc-name {
  font-family: var(--font-display);
  font-size: 0.95em;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.2px;
  line-height: 1.25;
  display: inline-flex;
  align-items: center;
  gap: 0.2em;
  flex-shrink: 0;
}

.npc-name-icon {
  font-size: 0.75em;
  color: var(--accent-gold);
}

.npc-rep-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25em;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-start;
}

.npc-wealth-tag {
  font-family: var(--font-mono);
  font-size: 0.7em;
  font-weight: 600;
  padding: 0.15em 0.45em;
  border-radius: 6px;
  letter-spacing: 0.2px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
}

.wealth-destitute {
  background: var(--wealth-destitute-bg);
  color: var(--wealth-destitute-fg);
  border: 1px solid var(--wealth-destitute-bd);
}
.wealth-poor {
  background: var(--wealth-poor-bg);
  color: var(--wealth-poor-fg);
  border: 1px solid var(--wealth-poor-bd);
}
.wealth-tight {
  background: var(--wealth-tight-bg);
  color: var(--wealth-tight-fg);
  border: 1px solid var(--wealth-tight-bd);
}
.wealth-balanced {
  background: var(--wealth-balanced-bg);
  color: var(--wealth-balanced-fg);
  border: 1px solid var(--wealth-balanced-bd);
}
.wealth-comfortable {
  background: var(--wealth-comfortable-bg);
  color: var(--wealth-comfortable-fg);
  border: 1px solid var(--wealth-comfortable-bd);
}
.wealth-welloff {
  background: var(--wealth-welloff-bg);
  color: var(--wealth-welloff-fg);
  border: 1px solid var(--wealth-welloff-bd);
}
.wealth-rich {
  background: var(--wealth-rich-bg);
  color: var(--wealth-rich-fg);
  border: 1px solid var(--wealth-rich-bd);
}
.wealth-tycoon {
  background: var(--wealth-tycoon-bg);
  color: var(--wealth-tycoon-fg);
  border: 1px solid var(--wealth-tycoon-bd);
}

.npc-chip {
  font-size: 0.68em;
  line-height: 1.35;
  padding: 0.12em 0.4em;
  border-radius: 6px;
  max-width: 100%;
  word-break: break-word;
  border: 1px solid var(--border-subtle);
  background: var(--bg-step);
  color: var(--text-secondary);
  white-space: nowrap;

  &--rep {
    color: var(--text-primary);
    border-color: rgba(180, 150, 80, 0.35);
    background: rgba(200, 164, 92, 0.1);
  }
}

.npc-chain-section {
  background: var(--bg-chain);
  border-radius: var(--radius-sm);
  padding: 0.4em 0.55em;
  border-left: 2px solid var(--border-chain);
  width: 100%;
}

.chain-label {
  font-family: var(--font-mono);
  font-size: 0.68em;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--accent-lavender);
  text-transform: uppercase;
  margin-bottom: 0.2em;
}

.chain-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2em;
  font-size: 0.78em;
  color: var(--text-secondary);
  line-height: 1.45;
}

.chain-step {
  background: var(--bg-step);
  color: var(--text-primary);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-weight: 500;
  white-space: normal;
  word-break: break-word;
  min-width: 0;
}

.chain-arrow {
  color: var(--accent-gold);
  font-weight: 700;
  flex-shrink: 0;
}

.chain-predict {
  color: var(--accent-rose);
  font-weight: 600;
  font-style: italic;
  word-break: break-word;
  min-width: 0;
}

.chain-debut-tag {
  background: var(--debut-bg);
  color: var(--debut-fg);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-weight: 700;
  font-size: 0.85em;
  letter-spacing: 0.2px;
  animation: pulseTag 2s ease-in-out infinite;
  white-space: nowrap;
}

@keyframes pulseTag {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.82;
  }
}

/* —— 分区标题 —— */
.npc-section {
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  width: 100%;
}

.npc-section-head {
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--accent-lavender);
}

/* 当前状态：前三项等宽格，「正在做」通栏 */
.npc-status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35em;
  width: 100%;

  &.has-doing {
    grid-template-areas:
      'a b c'
      'd d d';
  }
}

.npc-status-cell {
  min-width: 0;
  padding: 0.35em 0.45em;
  border-radius: 6px;
  background: var(--bg-step);
  border: 1px solid var(--border-subtle);

  &:nth-child(1) {
    grid-area: a;
  }
  &:nth-child(2) {
    grid-area: b;
  }
  &:nth-child(3) {
    grid-area: c;
  }

  &--doing {
    grid-area: d;
  }
}

.npc-status-grid:not(.has-doing) .npc-status-cell {
  grid-area: auto;
}

.npc-status-k {
  font-size: 0.65em;
  font-weight: 700;
  color: var(--accent-sky);
  letter-spacing: 0.3px;
  margin-bottom: 0.15em;
}

.npc-status-v {
  font-size: 0.78em;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-word;
}

/* 双卡：宽屏并排，等高拉伸 */
.npc-duo {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5em;
  width: 100%;
  align-items: stretch;

  &:has(> :only-child) {
    grid-template-columns: 1fr;
  }
}

.npc-subcard {
  background: var(--bg-panel, var(--bg-step));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.45em 0.55em 0.5em;
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  min-width: 0;
  min-height: 100%;
}

.npc-subcard-head {
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--accent-lavender);
  padding-bottom: 0.25em;
  border-bottom: 1px dashed var(--border-subtle);
}

.npc-subcard-body {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  flex: 1;
}

.npc-goal-text {
  margin: 0;
  font-size: 0.8em;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
  flex: 1;
}

/* 社交：分类在左，人物在右 */
.npc-social-row {
  display: grid;
  grid-template-columns: 3.2em minmax(0, 1fr);
  gap: 0.35em 0.5em;
  align-items: start;
}

.npc-social-cat {
  font-size: 0.7em;
  font-weight: 700;
  color: var(--accent-sky);
  line-height: 1.45;
  padding-top: 0.1em;
}

.npc-social-people {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  min-width: 0;
}

.npc-person {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15em 0.4em;
  padding: 0.2em 0.4em;
  border-radius: 6px;
  background: var(--memory-bg, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--memory-bd, var(--border-subtle));
}

.npc-person-name {
  font-size: 0.78em;
  font-weight: 700;
  color: var(--text-primary);
}

.npc-person-note {
  font-size: 0.7em;
  color: var(--text-secondary);
  word-break: break-word;
}

/* 背景 / 近期打算：键值行 */
.npc-bg-rows {
  gap: 0.3em;
}

.npc-bg-row {
  display: grid;
  grid-template-columns: 3.5em minmax(0, 1fr);
  gap: 0.35em 0.5em;
  align-items: baseline;
  padding: 0.25em 0.35em;
  border-radius: 6px;
  background: rgba(120, 150, 200, 0.08);
  border: 1px solid rgba(120, 150, 200, 0.2);
}

.npc-bg-key {
  font-size: 0.7em;
  font-weight: 700;
  color: var(--accent-sky);
}

.npc-bg-val {
  font-size: 0.78em;
  color: var(--text-primary);
  word-break: break-word;

  &.muted {
    color: var(--text-muted, var(--text-secondary));
    opacity: 0.75;
  }
}

/* 记忆：等宽分栏 + 有序列表 */
.npc-memory-section {
  gap: 0.4em;
}

.npc-memory-grid {
  display: grid;
  grid-template-columns: repeat(var(--mem-cols, 3), minmax(0, 1fr));
  gap: 0.5em;
  width: 100%;
  align-items: stretch;
}

.npc-memory-col {
  display: flex;
  flex-direction: column;
  gap: 0.3em;
  min-width: 0;
  padding: 0.4em 0.5em;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--memory-bg, var(--bg-step));
  min-height: 100%;

  &--settled {
    background: var(--memory-settled-bg, var(--bg-step));
    border-color: var(--memory-settled-bd, var(--border-subtle));
  }

  &--core {
    background: var(--memory-core-bg, var(--bg-step));
    border-color: var(--memory-core-bd, var(--border-subtle));
  }
}

.npc-memory-col-head {
  display: flex;
  align-items: center;
  gap: 0.3em;
  font-family: var(--font-mono);
  font-size: 0.7em;
  font-weight: 700;
  color: var(--accent-lavender);
  letter-spacing: 0.3px;
  padding-bottom: 0.25em;
  border-bottom: 1px dashed var(--border-subtle);
}

.npc-memory-col--core .npc-memory-col-head {
  color: var(--accent-gold);
}

.npc-memory-count {
  margin-left: auto;
  font-weight: 600;
  opacity: 0.7;
  font-size: 0.95em;
}

.npc-memory-list {
  margin: 0;
  padding: 0 0 0 1.15em;
  display: flex;
  flex-direction: column;
  gap: 0.3em;
  list-style: decimal;
}

.npc-memory-list li {
  font-size: 0.74em;
  line-height: 1.45;
  color: var(--text-secondary);
  word-break: break-word;
  padding-left: 0.15em;
}

.npc-memory-col--core .npc-memory-list li {
  color: var(--text-primary);
}

@media (max-width: 900px) {
  .npc-memory-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .npc-duo {
    grid-template-columns: 1fr;
  }

  .npc-status-grid {
    grid-template-columns: 1fr;
    grid-template-areas: none !important;

    .npc-status-cell {
      grid-area: auto !important;
    }
  }

  .npc-wealth-tag {
    margin-left: 0;
  }

  .npc-card-top {
    align-items: flex-start;
  }
}

@media (max-width: 640px) {
  .npc-rep-inline {
    flex: 1 1 100%;
    order: 3;
  }

  .npc-wealth-tag {
    order: 4;
  }

  .chain-arrow {
    display: none;
  }

  .chain-step,
  .chain-predict {
    flex: 1 1 100%;
  }

  .npc-social-row {
    grid-template-columns: 1fr;
  }
}
</style>
