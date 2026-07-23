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
      @toggle-theme="toggleTheme"
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

const loading = ref(true);
const empty = ref(false);
const chronicle = ref<ChronicleData | null>(null);
/** true = 浅色；与正则脚本 localStorage 值 light/dark 对齐 */
const themeLight = ref(false);

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
  padding: 0.85em 1em;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  overflow-wrap: anywhere;
  font-size: 0.85rem;

  code {
    font-size: 0.9em;
    color: var(--accent-lavender);
    font-family: var(--font-mono);
  }
}
</style>
