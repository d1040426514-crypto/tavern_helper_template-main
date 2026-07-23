<template>
  <div v-if="section.npcs.length" class="major-panel">
    <div class="panel-header" @click="open = !open">
      <span class="panel-icon">{{ section.icon }}</span>
      <span class="panel-label">
        {{ section.typeLabel }}
        <span class="panel-badge">{{ section.badge }} ({{ section.npcs.length }})</span>
      </span>
      <span class="panel-caret" :style="{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }">▼</span>
    </div>
    <div class="panel-content" :class="{ open }">
      <div class="npc-grid">
        <NpcCard v-for="npc in section.npcs" :key="npc.name" :npc="npc" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CategorySection } from '../types';
import NpcCard from './NpcCard.vue';

defineProps<{ section: CategorySection }>();

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
  transition: box-shadow var(--transition-smooth);
  position: relative;

  &:hover {
    box-shadow: var(--glow-accent);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: linear-gradient(180deg, var(--accent-lavender) 0%, var(--accent-rose) 40%, var(--accent-sky) 100%);
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
    opacity: 0.8;
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px 9px 16px;
  background: rgba(30, 26, 50, 0.5);
  cursor: pointer;
  transition: all 0.25s;
  font-weight: 700;
  font-size: 14px;
  font-family: var(--font-display);
  color: var(--text-accent);
  letter-spacing: 0.5px;
  gap: 6px;
  border-bottom: 1px solid transparent;
  min-height: 38px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background: rgba(36, 30, 58, 0.6);
    border-bottom-color: var(--border-glow);
  }
}

:global(.theme-light) .panel-header {
  background: rgba(240, 235, 225, 0.55);
  color: #3a2a18;

  &:hover {
    background: rgba(235, 228, 215, 0.65);
    border-bottom-color: rgba(150, 120, 80, 0.35);
  }
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
  background: rgba(180, 150, 220, 0.18);
  color: var(--accent-lavender);
  padding: 2px 6px;
  border-radius: 10px;
  letter-spacing: 1px;
  white-space: nowrap;
}

:global(.theme-light) .panel-badge {
  background: rgba(130, 100, 60, 0.15);
  color: #7a5c30;
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
    max-height: 10000px;
    padding: 10px 14px 14px;
  }
}

.npc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

@media (min-width: 900px) {
  .npc-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }
}

@media (min-width: 1200px) {
  .npc-grid {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
  }
}

@media (max-width: 640px) {
  .npc-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .panel-header {
    padding: 7px 10px 7px 12px;
    font-size: 12px;
    min-height: 36px;
  }
  .panel-content.open {
    padding: 8px 10px 12px;
  }
}
</style>
