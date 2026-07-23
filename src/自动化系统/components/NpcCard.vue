<template>
  <div class="npc-card" :class="{ 'npc-card--empty': npc.empty }">
    <div class="npc-card-top">
      <div class="npc-avatar" aria-hidden="true">🌟</div>
      <div class="npc-identity">
        <div class="npc-name">
          <span class="npc-name-icon">💠</span>
          {{ npc.name }}
        </div>
        <span v-if="npc.wealth" class="npc-wealth-tag" :class="wealthCls">
          {{ wealthEmoji }} {{ npc.wealth }}
        </span>
        <span v-else-if="npc.empty" class="npc-wealth-tag wealth-balanced">暂无行动数据</span>
      </div>
    </div>

    <div v-if="npc.statusParts.length" class="npc-status-row">
      <span v-for="(part, i) in npc.statusParts" :key="i" class="npc-status-item">
        <span class="npc-status-dot">●</span>
        <strong>{{ statusLabels[i] || '详情' }}:</strong>
        {{ part }}
      </span>
    </div>

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

    <div v-if="npc.longGoal" class="npc-info-row">
      <span class="npc-info-label">🎯 长期目标:</span>
      <span class="npc-info-value">{{ npc.longGoal }}</span>
    </div>

    <div v-if="npc.nearPlan.length" class="npc-info-row">
      <span class="npc-info-label">📅 近期打算:</span>
      <span class="npc-info-value">{{ npc.nearPlan.join(' · ') }}</span>
    </div>

    <div v-if="npc.relatedEvent && npc.relatedEvent !== '无'" class="npc-info-row">
      <span class="npc-info-label">🔗 关联事件:</span>
      <span class="npc-info-value">{{ npc.relatedEvent }}</span>
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
  gap: 5px;
  min-width: 0;

  &:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-glow);
    box-shadow: var(--glow-accent);
  }

  &--empty {
    opacity: 0.78;
  }
}

.npc-card-top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  position: relative;
  z-index: 1;
}

.npc-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--bg-step), rgba(140, 170, 210, 0.18));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
}

.npc-identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.npc-name {
  font-family: var(--font-display);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.2px;
  line-height: 1.25;
  display: flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
}

.npc-name-icon {
  font-size: 0.62rem;
  color: var(--accent-gold);
}

.npc-wealth-tag {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 6px;
  letter-spacing: 0.2px;
  white-space: nowrap;
  display: inline-block;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
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

.npc-status-row {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  position: relative;
  z-index: 1;
  line-height: 1.4;
}

.npc-status-item {
  min-width: 0;
  word-break: break-word;
}

.npc-status-dot {
  color: var(--accent-sky);
  font-weight: 700;
}

.npc-chain-section {
  background: var(--bg-chain);
  border-radius: var(--radius-sm);
  padding: 5px 7px;
  position: relative;
  z-index: 1;
  border-left: 2px solid var(--border-chain);
}

.chain-label {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--accent-lavender);
  text-transform: uppercase;
  margin-bottom: 2px;
  font-family: var(--font-mono);
}

.chain-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  font-size: 0.62rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.chain-step {
  background: var(--bg-step);
  color: var(--text-primary);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 500;
  white-space: normal;
  word-break: break-word;
  min-width: 0;
  font-size: 0.6rem;
}

.chain-arrow {
  color: var(--accent-gold);
  font-weight: 700;
  flex-shrink: 0;
  font-size: 0.62rem;
}

.chain-predict {
  color: var(--accent-rose);
  font-weight: 600;
  font-style: italic;
  font-size: 0.6rem;
  word-break: break-word;
  min-width: 0;
}

.chain-debut-tag {
  background: var(--debut-bg);
  color: var(--debut-fg);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 700;
  font-size: 0.55rem;
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

.npc-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 4px;
  font-size: 0.62rem;
  color: var(--text-secondary);
  position: relative;
  z-index: 1;
  line-height: 1.45;
}

.npc-info-label {
  font-weight: 700;
  color: var(--accent-sky);
  white-space: nowrap;
  font-size: 0.58rem;
  letter-spacing: 0.2px;
}

.npc-info-value {
  color: var(--text-primary);
  word-break: break-word;
  min-width: 0;
  flex: 1;
}

.npc-memory-block {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.memory-label {
  font-family: var(--font-mono);
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--accent-lavender);
  text-transform: uppercase;
}

.npc-memory-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.memory-tag {
  font-size: 0.56rem;
  background: var(--memory-bg);
  border: 1px solid var(--memory-bd);
  padding: 1px 5px;
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

@media (max-width: 640px) {
  .npc-card {
    padding: 7px 8px;
    gap: 4px;
  }

  .npc-avatar {
    width: 26px;
    height: 26px;
    font-size: 12px;
  }

  .npc-name {
    font-size: 0.8rem;
  }

  .npc-status-row {
    font-size: 0.56rem;
    flex-direction: column;
    gap: 2px;
  }

  .chain-flow {
    font-size: 0.6rem;
  }

  .chain-step,
  .chain-predict {
    flex: 1 1 100%;
  }

  .chain-arrow {
    display: none;
  }

  .npc-info-row {
    flex-direction: column;
    gap: 1px;
    font-size: 0.6rem;
  }
}
</style>
