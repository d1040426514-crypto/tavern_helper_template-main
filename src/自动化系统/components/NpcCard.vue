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

    <div v-if="npc.statusParts.length" class="npc-status-row">
      <span v-for="(part, i) in npc.statusParts" :key="i" class="npc-status-item">
        <span class="npc-status-dot">●</span>
        <strong>{{ statusLabels[i] || '详情' }}:</strong>
        {{ part }}
      </span>
    </div>

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

    <div v-if="npc.longGoal" class="npc-info-row">
      <span class="npc-info-label">🎯 长期目标:</span>
      <span class="npc-info-value">{{ npc.longGoal }}</span>
    </div>

    <div v-if="npc.nearPlan.length" class="npc-info-row">
      <span class="npc-info-label">📅 近期打算:</span>
      <span class="npc-info-value">{{ npc.nearPlan.join(' · ') }}</span>
    </div>

    <div v-if="npc.recentMemories.length" class="npc-memory-block">
      <div class="memory-label">近期记忆</div>
      <div class="npc-memory-tags">
        <span v-for="(m, i) in npc.recentMemories" :key="'r' + i" class="memory-tag">🧠 {{ m }}</span>
      </div>
    </div>
    <div v-if="npc.settledMemories.length" class="npc-memory-block">
      <div class="memory-label">沉淀记忆</div>
      <div class="npc-memory-tags">
        <span v-for="(m, i) in npc.settledMemories" :key="'s' + i" class="memory-tag memory-tag--settled">
          📜 {{ m }}
        </span>
      </div>
    </div>
    <div v-if="npc.coreMemories.length" class="npc-memory-block">
      <div class="memory-label">核心记忆</div>
      <div class="npc-memory-tags">
        <span v-for="(m, i) in npc.coreMemories" :key="'c' + i" class="memory-tag memory-tag--core">
          💎 {{ m }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getWealthClass, getWealthEmoji } from '../parse';
import { STATUS_LABELS, type NpcCard } from '../types';

const props = defineProps<{ npc: NpcCard }>();

const statusLabels = STATUS_LABELS;
const wealthCls = computed(() => getWealthClass(props.npc.wealth));
const wealthEmoji = computed(() => getWealthEmoji(props.npc.wealth));

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

.chain-label,
.memory-label {
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

.npc-status-row {
  font-family: var(--font-mono);
  font-size: 0.72em;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 0.25em 0.85em;
  line-height: 1.4;
  width: 100%;
}

.npc-status-item {
  min-width: 0;
  word-break: break-word;
}

.npc-status-dot {
  color: var(--accent-sky);
  font-weight: 700;
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

/* 背景：三行键值，对齐整齐 */
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

.npc-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15em 0.3em;
  font-size: 0.78em;
  color: var(--text-secondary);
  line-height: 1.45;
  width: 100%;
}

.npc-info-label {
  font-weight: 700;
  color: var(--accent-sky);
  white-space: nowrap;
}

.npc-info-value {
  color: var(--text-primary);
  word-break: break-word;
  min-width: 0;
  flex: 1;
}

.npc-memory-block {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
  width: 100%;
}

.npc-memory-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25em;
}

.memory-tag {
  font-size: 0.72em;
  background: var(--memory-bg);
  border: 1px solid var(--memory-bd);
  padding: 0.12em 0.4em;
  border-radius: 6px;
  color: var(--text-secondary);
  line-height: 1.35;
  max-width: 100%;
  word-break: break-word;

  &--settled {
    background: var(--memory-settled-bg);
    border-color: var(--memory-settled-bd);
  }

  &--core {
    background: var(--memory-core-bg);
    border-color: var(--memory-core-bd);
    color: var(--accent-gold);
  }
}

@media (max-width: 720px) {
  .npc-duo {
    grid-template-columns: 1fr;
  }

  .npc-wealth-tag {
    margin-left: 0;
  }

  .npc-card-top {
    align-items: flex-start;
  }
}

@media (max-width: 640px) {
  .npc-status-row {
    flex-direction: column;
    gap: 0.2em;
  }

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
