<template>
  <div class="npc-card" :class="{ 'npc-card--empty': npc.empty }">
    <div class="npc-card-top">
      <div class="npc-avatar">🌟</div>
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
      <span v-for="(part, i) in npc.statusParts" :key="i">
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
  padding: 12px 14px;
  box-shadow: var(--glow-card);
  transition: all var(--transition-smooth);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-glow);
    box-shadow: var(--glow-accent);
    transform: translateY(-2px);
  }

  &::after {
    content: '';
    position: absolute;
    top: -20px;
    right: -20px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(180, 150, 220, 0.06) 0%, transparent 70%);
    pointer-events: none;
  }

  &--empty {
    opacity: 0.72;
  }
}

.npc-card-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.npc-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(180, 150, 220, 0.3), rgba(140, 170, 210, 0.25));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  border: 2px solid rgba(200, 180, 230, 0.4);
  box-shadow: 0 0 8px rgba(160, 140, 200, 0.2);
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
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.3px;
  line-height: 1.3;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.npc-name-icon {
  font-size: 0.7rem;
  color: var(--accent-gold);
}

.npc-wealth-tag {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  letter-spacing: 0.3px;
  white-space: nowrap;
  display: inline-block;
  width: fit-content;
}

.wealth-destitute {
  background: rgba(200, 120, 100, 0.2);
  color: #e09080;
  border: 1px solid rgba(200, 120, 100, 0.35);
}
.wealth-poor {
  background: rgba(200, 150, 100, 0.2);
  color: #d4a070;
  border: 1px solid rgba(200, 150, 100, 0.35);
}
.wealth-tight {
  background: rgba(190, 160, 110, 0.2);
  color: #c8a860;
  border: 1px solid rgba(190, 160, 110, 0.35);
}
.wealth-balanced {
  background: rgba(160, 180, 140, 0.2);
  color: #a0b880;
  border: 1px solid rgba(160, 180, 140, 0.35);
}
.wealth-comfortable {
  background: rgba(130, 180, 150, 0.2);
  color: #80b890;
  border: 1px solid rgba(130, 180, 150, 0.35);
}
.wealth-welloff {
  background: rgba(120, 170, 180, 0.2);
  color: #78a8b4;
  border: 1px solid rgba(120, 170, 180, 0.35);
}
.wealth-rich {
  background: rgba(180, 160, 100, 0.25);
  color: #d4c070;
  border: 1px solid rgba(200, 170, 100, 0.5);
  box-shadow: 0 0 6px rgba(200, 170, 100, 0.15);
}
.wealth-tycoon {
  background: rgba(200, 170, 90, 0.3);
  color: #f0d080;
  border: 1px solid rgba(220, 190, 100, 0.6);
  box-shadow: 0 0 8px rgba(220, 190, 100, 0.25);
}

.npc-status-row {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  position: relative;
  z-index: 1;
  line-height: 1.4;
}

.npc-status-dot {
  color: var(--accent-sky);
  font-weight: 700;
}

.npc-chain-section {
  background: rgba(30, 26, 50, 0.5);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  position: relative;
  z-index: 1;
  border-left: 3px solid var(--accent-lavender);
}

:global(.theme-light) .npc-chain-section {
  background: rgba(235, 228, 215, 0.5);
  border-left-color: rgba(130, 100, 60, 0.5);
}

.chain-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: var(--accent-lavender);
  text-transform: uppercase;
  margin-bottom: 3px;
  font-family: var(--font-mono);
}

.chain-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  font-size: 0.68rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.chain-step {
  background: rgba(180, 150, 220, 0.12);
  padding: 2px 6px;
  border-radius: 5px;
  font-weight: 500;
  white-space: normal;
  word-break: break-word;
  min-width: 0;
  font-size: 0.65rem;
}

.chain-arrow {
  color: var(--accent-gold);
  font-weight: 700;
  flex-shrink: 0;
  font-size: 0.7rem;
}

.chain-predict {
  color: var(--accent-rose);
  font-weight: 600;
  font-style: italic;
  font-size: 0.65rem;
  word-break: break-word;
  min-width: 0;
}

.chain-debut-tag {
  background: rgba(220, 150, 120, 0.25);
  color: #f0b090;
  padding: 2px 6px;
  border-radius: 5px;
  font-weight: 700;
  font-size: 0.6rem;
  letter-spacing: 0.3px;
  animation: pulseTag 2s ease-in-out infinite;
  white-space: nowrap;
}

@keyframes pulseTag {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(220, 150, 120, 0.5);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(220, 150, 120, 0);
  }
}

.npc-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 5px;
  font-size: 0.68rem;
  color: var(--text-secondary);
  position: relative;
  z-index: 1;
  line-height: 1.5;
}

.npc-info-label {
  font-weight: 700;
  color: var(--accent-sky);
  white-space: nowrap;
  font-size: 0.63rem;
  letter-spacing: 0.3px;
}

.npc-info-value {
  color: var(--text-primary);
  word-break: break-word;
}

.npc-memory-block {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.memory-label {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--accent-lavender);
  text-transform: uppercase;
}

.npc-memory-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.memory-tag {
  font-size: 0.62rem;
  background: rgba(160, 140, 200, 0.12);
  border: 1px solid rgba(160, 140, 200, 0.25);
  padding: 2px 6px;
  border-radius: 8px;
  color: var(--text-secondary);
  line-height: 1.4;
  max-width: 100%;
  word-break: break-word;
  transition: all 0.2s;

  &:hover {
    background: rgba(180, 150, 220, 0.2);
    border-color: rgba(180, 150, 220, 0.4);
    color: var(--text-primary);
  }

  &--settled {
    background: rgba(140, 170, 200, 0.12);
    border-color: rgba(140, 170, 200, 0.25);
  }

  &--core {
    background: rgba(200, 170, 100, 0.15);
    border-color: rgba(200, 170, 100, 0.35);
    color: var(--accent-gold);
  }
}

@media (max-width: 640px) {
  .npc-card {
    padding: 10px 12px;
    gap: 5px;
  }
  .npc-avatar {
    width: 30px;
    height: 30px;
    font-size: 15px;
  }
  .npc-name {
    font-size: 0.85rem;
  }
}
</style>
