<template>
  <div class="chronicle-container" :class="themeLight ? 'theme-light' : 'theme-dark'">
    <div class="chronicle-header" @click="onHeaderClick">
      <div class="header-icon-group">
        <span class="header-icon-main">🎭</span>
      </div>
      <div class="header-title-area">
        <div class="header-title">后台动态观测</div>
      </div>
      <div v-if="data.timeBadge" class="header-time-badge">{{ data.timeBadge }}</div>
      <div class="header-controls">
        <span class="toggle-badge">{{ expanded ? '收起' : '展开' }}</span>
        <span class="header-caret" :style="{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }">
          ▼
        </span>
        <button
          type="button"
          class="theme-btn"
          title="切换主题"
          @click.stop="$emit('toggle-theme')"
        >
          {{ themeLight ? '☀️' : '🌙' }}
        </button>
      </div>
    </div>

    <div class="chronicle-body" :class="{ expanded }">
      <div class="chronicle-inner">
        <template v-if="hasContent">
          <CategoryPanel v-for="sec in data.sections" :key="sec.key" :section="sec" />
          <InteractionPanel :interactions="data.interactions" />
        </template>
        <div v-else class="empty-hint">📭 暂无后台动态数据</div>
      </div>
      <div class="footer-line">✧ 角色观测终端 ✧</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChronicleData } from '../types';
import CategoryPanel from './CategoryPanel.vue';
import InteractionPanel from './InteractionPanel.vue';

const props = defineProps<{
  data: ChronicleData;
  themeLight: boolean;
  defaultExpanded?: boolean;
}>();

defineEmits<{ 'toggle-theme': [] }>();

const expanded = ref(props.defaultExpanded ?? false);

const hasContent = computed(
  () =>
    props.data.sections.some(s => s.npcs.length > 0) || props.data.interactions.length > 0,
);

function onHeaderClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('.theme-btn')) return;
  expanded.value = !expanded.value;
}
</script>

<style lang="scss" scoped>
.chronicle-container {
  background: var(--bg-deep);
  background-image:
    radial-gradient(ellipse at 25% 10%, rgba(160, 140, 200, 0.06) 0%, transparent 55%),
    radial-gradient(ellipse at 70% 85%, rgba(180, 160, 210, 0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 45% 40%, rgba(140, 170, 200, 0.04) 0%, transparent 60%),
    radial-gradient(1px 1px at 15% 18%, rgba(220, 210, 240, 0.5) 0%, transparent 100%),
    radial-gradient(1px 1px at 32% 28%, rgba(210, 200, 230, 0.4) 0%, transparent 100%),
    radial-gradient(1.5px 1.5px at 55% 12%, rgba(230, 220, 245, 0.45) 0%, transparent 100%),
    radial-gradient(1px 1px at 72% 38%, rgba(200, 190, 225, 0.35) 0%, transparent 100%),
    radial-gradient(1.5px 1.5px at 88% 20%, rgba(215, 205, 235, 0.4) 0%, transparent 100%),
    radial-gradient(1px 1px at 40% 60%, rgba(195, 185, 220, 0.3) 0%, transparent 100%),
    radial-gradient(1px 1px at 65% 70%, rgba(210, 200, 230, 0.35) 0%, transparent 100%);
  border-radius: var(--radius-xl);
  border: 2px solid var(--border-glow);
  box-shadow:
    var(--glow-soft),
    0 0 0 1px rgba(160, 140, 200, 0.15) inset,
    0 0 60px rgba(100, 80, 160, 0.1);
  font-family: var(--font-body);
  color: var(--text-primary);
  margin: 0;
  position: relative;
  overflow: hidden;
  max-width: 100%;
  transition: all var(--transition-smooth);

  &.theme-light {
    background-image:
      radial-gradient(ellipse at 20% 8%, rgba(180, 160, 130, 0.08) 0%, transparent 55%),
      radial-gradient(ellipse at 75% 88%, rgba(170, 150, 120, 0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(200, 180, 150, 0.05) 0%, transparent 60%);
    box-shadow:
      0 0 24px rgba(80, 60, 30, 0.08),
      0 0 0 1px rgba(140, 110, 70, 0.2) inset;
    border-color: rgba(150, 120, 80, 0.3);
  }

  &::before {
    content: '';
    position: absolute;
    top: 6px;
    left: 6px;
    right: 6px;
    bottom: 6px;
    border: 1px solid rgba(160, 140, 200, 0.18);
    border-radius: calc(var(--radius-xl) - 4px);
    pointer-events: none;
    z-index: 1;
  }

  &.theme-light::before {
    border-color: rgba(150, 120, 80, 0.2);
  }
}

.chronicle-header {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  background: linear-gradient(160deg, rgba(20, 16, 40, 0.95) 0%, rgba(28, 22, 50, 0.9) 40%, rgba(22, 18, 44, 0.92) 100%);
  border-bottom: 1.5px solid var(--border-glow);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  cursor: pointer;
  user-select: none;
  position: relative;
  z-index: 3;
  gap: 8px;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--transition-smooth);

  &:hover {
    background: linear-gradient(160deg, rgba(26, 20, 48, 0.95) 0%, rgba(34, 26, 58, 0.9) 40%, rgba(28, 22, 52, 0.92) 100%);
  }
}

.theme-light .chronicle-header {
  background: linear-gradient(160deg, #3a3048 0%, #4a3d58 40%, #3f344e 100%);

  &:hover {
    background: linear-gradient(160deg, #42384f 0%, #524560 40%, #473c55 100%);
  }
}

.header-icon-group {
  display: flex;
  align-items: center;
  gap: 2px;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.header-icon-main {
  font-size: 20px;
  filter: drop-shadow(0 0 6px rgba(180, 150, 220, 0.5));
}

.header-title-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.header-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: #e8ddf5;
  text-shadow: 0 0 10px rgba(180, 150, 220, 0.3);
  line-height: 1.2;
}

.header-time-badge {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  color: #d8cee8;
  background: rgba(255, 255, 255, 0.05);
  padding: 3px 10px;
  border-radius: 16px;
  border: 1px solid rgba(180, 150, 220, 0.25);
  white-space: nowrap;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  min-width: 40px;
  text-align: center;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.toggle-badge {
  font-size: 8px;
  font-family: var(--font-mono);
  background: rgba(255, 255, 255, 0.06);
  color: #c8bdd8;
  padding: 3px 8px;
  border-radius: 12px;
  letter-spacing: 0.8px;
  border: 1px solid rgba(180, 150, 220, 0.18);
  white-space: nowrap;
}

.header-caret {
  font-size: 14px;
  color: var(--accent-lavender);
  transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1.2);
  filter: drop-shadow(0 0 6px rgba(180, 150, 220, 0.5));
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(180, 150, 220, 0.2);
}

.theme-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(180, 150, 220, 0.3);
  color: var(--accent-lavender);
  font-size: 14px;
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  backdrop-filter: blur(4px);
  padding: 0;

  &:hover {
    background: rgba(180, 150, 220, 0.2);
    border-color: var(--accent-lavender);
    box-shadow: 0 0 10px rgba(180, 150, 220, 0.4);
  }
}

.chronicle-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.55s cubic-bezier(0.33, 1, 0.68, 1);
  position: relative;
  z-index: 2;

  &.expanded {
    max-height: 12000px;
  }
}

.chronicle-inner {
  padding: 12px 14px 14px;
}

.empty-hint {
  color: var(--text-muted);
  padding: 12px;
  text-align: center;
  font-size: 0.85rem;
}

.footer-line {
  text-align: center;
  font-size: 7px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
  padding: 8px 0 10px;
  font-family: var(--font-mono);
  letter-spacing: 1.5px;
}

@media (max-width: 640px) {
  .chronicle-inner {
    padding: 10px 10px 12px;
  }
  .chronicle-header {
    padding: 7px 10px;
    gap: 6px;
    flex-wrap: wrap;
    row-gap: 6px;
  }
  .header-title {
    font-size: 13px;
  }
  .header-time-badge {
    flex-basis: 100%;
    width: 100%;
    max-width: 100%;
    margin-top: 2px;
    text-align: left;
    white-space: normal;
    word-break: break-word;
    order: 10;
    font-size: 9px;
    padding: 4px 10px;
    border-radius: 20px;
  }
  .header-icon-main {
    font-size: 18px;
  }
}
</style>
