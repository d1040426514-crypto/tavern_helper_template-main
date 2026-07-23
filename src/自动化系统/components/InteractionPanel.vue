<template>
  <div v-if="interactions.length" class="major-panel">
    <div class="panel-header" @click="open = !open">
      <span class="panel-icon">🔀</span>
      <span class="panel-label">
        角色交互事件
        <span class="panel-badge">EVENTS ({{ interactions.length }})</span>
      </span>
      <span class="panel-caret" :style="{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }">▼</span>
    </div>
    <div class="panel-content" :class="{ open }">
      <div class="ix-list">
        <div v-for="ix in interactions" :key="ix.id" class="ix-card">
          <div class="ix-top">
            <span class="ix-id">{{ ix.id }}</span>
            <span v-if="ix.roles.length" class="ix-roles">{{ ix.roles.join(' · ') }}</span>
          </div>
          <div v-if="ix.summary" class="ix-row">
            <span class="ix-label">简述</span>
            <span class="ix-value">{{ ix.summary }}</span>
          </div>
          <div v-if="ix.result" class="ix-row">
            <span class="ix-label">结果</span>
            <span class="ix-value">{{ ix.result }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { InteractionEvent } from '../types';

defineProps<{ interactions: InteractionEvent[] }>();

const open = ref(true);
</script>

<style lang="scss" scoped>
.major-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  margin-bottom: 10px;
  box-shadow: var(--glow-card);
  overflow: hidden;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: linear-gradient(180deg, var(--accent-coral) 0%, var(--accent-gold) 100%);
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
    opacity: 0.85;
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px 9px 16px;
  background: rgba(30, 26, 50, 0.5);
  cursor: pointer;
  font-weight: 700;
  font-size: 14px;
  font-family: var(--font-display);
  color: var(--text-accent);
  letter-spacing: 0.5px;
  gap: 6px;
  min-height: 38px;
  user-select: none;
}

.panel-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.panel-label {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.panel-badge {
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 600;
  background: rgba(224, 160, 144, 0.18);
  color: var(--accent-coral);
  padding: 2px 6px;
  border-radius: 10px;
  letter-spacing: 1px;
  white-space: nowrap;
}

.panel-caret {
  font-size: 12px;
  transition: transform 0.4s;
  color: var(--accent-lavender);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(180, 150, 220, 0.08);
  flex-shrink: 0;
}

.panel-content {
  max-height: 0;
  overflow: hidden;
  transition:
    max-height 0.45s ease-out,
    padding 0.45s ease-out;
  padding: 0 14px;

  &.open {
    max-height: 4000px;
    padding: 10px 14px 14px;
  }
}

.ix-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ix-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ix-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.ix-id {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-coral);
  background: rgba(224, 160, 144, 0.12);
  padding: 2px 8px;
  border-radius: 8px;
  border: 1px solid rgba(224, 160, 144, 0.3);
}

.ix-roles {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.ix-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 0.7rem;
  line-height: 1.45;
}

.ix-label {
  font-weight: 700;
  color: var(--accent-sky);
  font-size: 0.63rem;
  letter-spacing: 0.3px;
}

.ix-value {
  color: var(--text-primary);
  word-break: break-word;
}
</style>
