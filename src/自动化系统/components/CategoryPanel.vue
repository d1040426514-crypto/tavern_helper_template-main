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
  margin-bottom: 8px;
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
    width: 2px;
    height: 100%;
    background: linear-gradient(180deg, var(--accent-lavender) 0%, var(--accent-rose) 45%, var(--accent-sky) 100%);
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
    opacity: 0.85;
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 6px 12px;
  background: var(--bg-panel-header);
  cursor: pointer;
  transition: background 0.2s;
  font-weight: 700;
  font-size: 0.78rem;
  font-family: var(--font-display);
  color: var(--text-accent);
  letter-spacing: 0.3px;
  gap: 5px;
  border-bottom: 1px solid transparent;
  min-height: var(--touch-min);
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background: var(--bg-panel-header-hover);
    border-bottom-color: var(--border-glow);
  }
}

.panel-icon {
  font-size: 0.85rem;
  flex-shrink: 0;
  line-height: 1;
}

.panel-label {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex-wrap: wrap;
}

.panel-badge {
  font-family: var(--font-mono);
  font-size: 0.52rem;
  font-weight: 600;
  background: var(--bg-step);
  color: var(--accent-lavender);
  padding: 1px 5px;
  border-radius: 8px;
  letter-spacing: 0.6px;
  white-space: nowrap;
}

.panel-caret {
  font-size: 0.65rem;
  transition: transform 0.35s;
  color: var(--accent-lavender);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-control);
  flex-shrink: 0;
}

.panel-content {
  max-height: 0;
  overflow: hidden;
  transition:
    max-height 0.4s ease-out,
    padding 0.4s ease-out;
  padding: 0 var(--panel-pad-x);

  &.open {
    max-height: 20000px;
    padding: 8px var(--panel-pad-x) 10px;
  }
}

.npc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

@media (min-width: 720px) {
  .npc-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
  }
}

@media (min-width: 1100px) {
  .npc-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }
}

@media (max-width: 640px) {
  .major-panel {
    margin-bottom: 6px;
  }

  .npc-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .panel-header {
    padding: 7px 8px 7px 10px;
    font-size: 0.75rem;
    min-height: 40px;
  }

  .panel-caret {
    width: 36px;
    height: 36px;
  }

  .panel-content.open {
    padding: 6px 8px 8px;
  }
}
</style>
