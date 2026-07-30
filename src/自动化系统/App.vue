<template>
  <div class="chronicle-root" :class="{ 'theme-light': themeLight }">
    <div v-if="loading" class="app-hint">读取后台角色变量…</div>
    <div v-else-if="empty" class="app-hint">
      本层暂无 <code>post_process_tags.后台角色交互预演</code> /
      <code>post_process_tags.npc_act</code>
    </div>
    <ChronicleView
      v-else
      :data="chronicle!"
      :theme-light="themeLight"
      :font-scale="fontScale"
      @toggle-theme="toggleTheme"
      @font-smaller="adjustFont(-FONT_STEP)"
      @font-larger="adjustFont(FONT_STEP)"
    />
  </div>
</template>

<script setup lang="ts">
import './theme.scss';
import ChronicleView from './components/ChronicleView.vue';
import { hasChronicleSource, loadChronicle } from './data';
import { isChronicleEmpty } from './parse';
import type { ChronicleData } from './types';

const THEME_KEY = 'chronicleTheme';
const FONT_KEY = 'chronicleFontScale';
const FONT_MIN = 0.85;
const FONT_MAX = 1.25;
const FONT_STEP = 0.05;

const loading = ref(true);
const empty = ref(false);
const chronicle = ref<ChronicleData | null>(null);
/** true = 浅色；与正则脚本 localStorage 值 light/dark 对齐 */
const themeLight = ref(false);
const fontScale = ref(1);

function clampFont(n: number): number {
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n * 100) / 100));
}

function persistFont(scale: number) {
  try {
    localStorage.setItem(FONT_KEY, String(scale));
  } catch {
    /* ignore */
  }
}

function adjustFont(delta: number) {
  fontScale.value = clampFont(fontScale.value + delta);
  persistFont(fontScale.value);
}

function toggleTheme() {
  themeLight.value = !themeLight.value;
  try {
    localStorage.setItem(THEME_KEY, themeLight.value ? 'light' : 'dark');
  } catch {
    /* ignore */
  }
}

function load() {
  try {
    if (!hasChronicleSource()) {
      empty.value = true;
      chronicle.value = null;
      loading.value = false;
      return;
    }
    const data = loadChronicle();
    empty.value = isChronicleEmpty(data);
    chronicle.value = data;
  } catch {
    empty.value = true;
    chronicle.value = null;
  }
  loading.value = false;
}

onMounted(() => {
  try {
    themeLight.value = localStorage.getItem(THEME_KEY) === 'light';
  } catch {
    themeLight.value = false;
  }
  try {
    const raw = localStorage.getItem(FONT_KEY);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) fontScale.value = clampFont(n);
    }
  } catch {
    fontScale.value = 1;
  }

  load();
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    if (hasChronicleSource()) {
      load();
      window.clearInterval(timer);
      return;
    }
    if (tries >= 12) window.clearInterval(timer);
  }, 400);
});
</script>

<style lang="scss" scoped>
.app-hint {
  padding: 12px 14px;
  color: var(--text-muted, #888);
  font-size: 0.8rem;
  line-height: 1.5;

  code {
    font-size: 0.9em;
  }
}

@media (max-width: 640px) {
  .app-hint {
    padding: 10px 12px;
    font-size: 0.75rem;
  }
}
</style>
