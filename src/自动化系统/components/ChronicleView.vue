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
    radial-gradient(ellipse at 70% 85%, rgba(180, 160, 210, 0.05) 0%, transparent 50%);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-glow);
  box-shadow: var(--glow-soft), 0 0 0 1px var(--border-inner) inset;
  font-family: var(--font-body);
  color: var(--text-primary);
  margin: 0;
  position: relative;
  overflow: hidden;
  max-width: 100%;
  transition: border-color var(--transition-smooth), box-shadow var(--transition-smooth);

  &.theme-light {
    background-image:
      radial-gradient(ellipse at 18% 0%, rgba(90, 110, 160, 0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 85% 100%, rgba(70, 100, 140, 0.05) 0%, transparent 45%);
  }

  &::before {
    content: '';
    position: absolute;
    inset: 4px;
    border: 1px solid var(--border-inner);
    border-radius: calc(var(--radius-xl) - 3px);
    pointer-events: none;
    z-index: 1;
  }
}

.chronicle-header {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-header);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  cursor: pointer;
  user-select: none;
  position: relative;
  z-index: 3;
  gap: 6px;
  min-height: var(--touch-min);
  -webkit-tap-highlight-color: transparent;
  transition: background var(--transition-smooth);

  &:hover {
    background: var(--bg-header-hover);
  }
}

.header-icon-group {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.header-icon-main {
  font-size: 16px;
  line-height: 1;
}

.header-title-area {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-family: var(--font-display);
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--text-header);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-time-badge {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 500;
  color: var(--text-on-chip);
  background: var(--bg-chip);
  padding: 2px 7px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.toggle-badge {
  font-size: 0.55rem;
  font-family: var(--font-mono);
  background: var(--bg-chip);
  color: var(--text-header-muted);
  padding: 2px 6px;
  border-radius: 8px;
  letter-spacing: 0.4px;
  border: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.header-caret {
  font-size: 0.7rem;
  color: var(--accent-lavender);
  transition: transform 0.35s ease;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-control);
  border: 1px solid var(--border-subtle);
}

.theme-btn {
  background: var(--bg-control);
  border: 1px solid var(--border-subtle);
  color: var(--accent-lavender);
  font-size: 0.8rem;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, border-color 0.2s;
  padding: 0;

  &:hover {
    background: var(--bg-step);
    border-color: var(--accent-lavender);
  }
}

.chronicle-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.5s cubic-bezier(0.33, 1, 0.68, 1);
  position: relative;
  z-index: 2;

  &.expanded {
    max-height: 20000px;
  }
}

.chronicle-inner {
  padding: var(--space-3) var(--space-4) var(--space-4);
}

.empty-hint {
  color: var(--text-muted);
  padding: var(--space-4);
  text-align: center;
  font-size: 0.78rem;
}

.footer-line {
  text-align: center;
  font-size: 0.5rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border-subtle);
  margin-top: 2px;
  padding: 6px 0 8px;
  font-family: var(--font-mono);
  letter-spacing: 1.2px;
}

/* —— 平板 —— */
@media (max-width: 900px) {
  .header-time-badge {
    max-width: 36%;
  }
}

/* —— 手机 —— */
@media (max-width: 640px) {
  .chronicle-container::before {
    inset: 3px;
  }

  .chronicle-inner {
    padding: var(--space-2) var(--space-3) var(--space-3);
  }

  .chronicle-header {
    padding: 6px 8px;
    gap: 5px;
    flex-wrap: wrap;
    row-gap: 5px;
    min-height: 40px;
  }

  .header-title {
    font-size: 0.82rem;
  }

  .header-time-badge {
    order: 10;
    flex-basis: 100%;
    max-width: 100%;
    width: 100%;
    white-space: normal;
    word-break: break-word;
    font-size: 0.58rem;
    padding: 4px 8px;
    line-height: 1.35;
  }

  .toggle-badge {
    display: none;
  }

  .header-caret,
  .theme-btn {
    width: 36px;
    height: 36px;
    font-size: 0.85rem;
  }

  .header-icon-main {
    font-size: 15px;
  }

  .footer-line {
    padding: 5px 0 7px;
  }
}

@media (max-width: 380px) {
  .header-title {
    font-size: 0.78rem;
    letter-spacing: 0.2px;
  }
}
</style>
