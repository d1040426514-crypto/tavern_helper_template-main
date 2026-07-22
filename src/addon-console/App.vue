<template>
  <div class="addon-console" :data-theme="theme">
    <header class="ac-header">
      <div class="ac-header-icon-wrap" aria-hidden="true">
        <span class="ac-header-icon-main">🌍</span>
        <span class="ac-header-icon-accent">✦</span>
      </div>
      <div class="ac-header-brand">
        <h1 class="ac-header-main-title">世界时局与经济简报</h1>
        <p class="ac-header-sub">
          <span class="ac-header-sub-en">Imperial Astronomical Archives · </span>星穹档案馆
        </p>
      </div>
      <div v-if="headerDate" class="ac-header-datetime">⏳ {{ headerDate }}</div>
      <div class="ac-tabs">
        <button type="button" class="ac-tab" :class="{ active: tab === 'brief' }" @click="tab = 'brief'">
          简报
        </button>
        <button type="button" class="ac-tab" :class="{ active: tab === 'control' }" @click="tab = 'control'">
          控制
        </button>
      </div>
      <div class="ac-header-actions">
        <button
          type="button"
          class="ac-btn ac-theme-btn"
          :title="theme === 'dark' ? '切换浅色' : '切换深色'"
          @click="toggleTheme"
        >
          {{ theme === 'dark' ? '☀️' : '🌙' }}
        </button>
        <button type="button" class="ac-btn" @click="reload">刷新</button>
        <button type="button" class="ac-btn ghost" @click="closeHost">关闭</button>
      </div>
    </header>

    <div v-if="!loading && !error && worldNames.length" class="ac-world-bar">
      <button
        v-for="name in worldNames"
        :key="name"
        type="button"
        class="ac-chip"
        :class="{ active: name === selectedWorld }"
        @click="selectedWorld = name"
      >
        {{ name }}
        <template v-if="worlds[name]?.降临"> ·降临</template>
        <template v-else-if="worlds[name]?.平行演化"> ·平行</template>
      </button>
    </div>

    <nav
      v-if="!loading && !error && tab === 'brief' && selectedWorld"
      class="ac-brief-page-tabs"
      aria-label="简报子页"
    >
      <button
        v-for="item in briefPages"
        :key="item.id"
        type="button"
        class="ac-brief-page-tab"
        :class="{ active: briefPage === item.id }"
        @click="briefPage = item.id"
      >
        <span class="ac-brief-page-tab-icon" aria-hidden="true">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div v-if="loading" class="ac-hint">⏳ 连接 Addon API…</div>
    <div v-else-if="error" class="ac-hint ac-warn">{{ error }}</div>
    <div v-else class="ac-main">
      <div v-if="warnings.length" class="ac-warn" style="margin: 10px 14px 0">
        <div v-for="(w, i) in warnings" :key="i">{{ w }}</div>
      </div>

      <div v-show="tab === 'brief'" class="ac-main-scroll">
        <StatusBoard :world="selectedWorldData" :world-name="selectedWorld || ''" :brief-page="briefPage" />
      </div>

      <div v-show="tab === 'control'" class="ac-main-scroll">
        <div class="ac-control-grid">
          <div style="display: flex; flex-direction: column; gap: 12px">
            <PlaneMergeToggle :value="planeMerge" @update:value="onPlaneMerge" />
            <WorldControls
              :worlds="worlds"
              :selected="selectedWorld"
              @select="selectedWorld = $event"
              @set-descent="onWorldDescent"
              @set-parallel="onWorldParallel"
              @create="onCreateWorld"
              @rename="onRenameWorld"
            />
          </div>
          <SingularityPanel :items="singularities" @toggle="onSingularity" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import './styles/tokens.scss';
import './styles/shell.scss';
import './styles/worldpaper.scss';
import { latestOpts, waitAddon, type AddonConsoleApi } from './bridge';
import PlaneMergeToggle from './components/PlaneMergeToggle.vue';
import SingularityPanel from './components/SingularityPanel.vue';
import StatusBoard from './components/StatusBoard.vue';
import WorldControls from './components/WorldControls.vue';

const loading = ref(true);
const error = ref('');
const warnings = ref<string[]>([]);
const theme = ref<'light' | 'dark'>('light');
const planeMerge = ref(false);
const worlds = ref<Record<string, any>>({});
const selectedWorld = ref<string | null>(null);
const tab = ref<'brief' | 'control'>('brief');
const briefPage = ref<'era' | 'plot' | 'econ'>('era');

const briefPages = [
  { id: 'era' as const, label: '时代快讯', icon: '🕰️' },
  { id: 'plot' as const, label: '世界剧情态势', icon: '⚔️' },
  { id: 'econ' as const, label: '世界经济简报', icon: '💰' },
];

let api: AddonConsoleApi | null = null;

const worldNames = computed(() => Object.keys(worlds.value));

const selectedWorldData = computed(() => {
  if (!selectedWorld.value) return null;
  return worlds.value[selectedWorld.value] ?? null;
});

const headerDate = computed(() => String(selectedWorldData.value?.刊报日期 ?? '').trim());

const singularities = computed(() => {
  const map = selectedWorldData.value?.时代快讯?.岁月史书?.特异点;
  if (!map || typeof map !== 'object') return [] as Array<{ name: string; 降临: boolean }>;
  return Object.entries(map).map(([name, item]) => ({
    name,
    降临: !!(item as any)?.降临,
  }));
});

function closeHost() {
  try {
    const host = _.get(window.parent, '__addonConsoleHost') as { close?: () => void } | undefined;
    host?.close?.();
  } catch {
    /* ignore */
  }
}

function applyResult(result: { data: Record<string, any>; warnings?: string[] }, preferWorld?: string) {
  worlds.value = result.data ?? {};
  warnings.value = result.warnings ?? [];
  const names = Object.keys(worlds.value);
  if (preferWorld && names.includes(preferWorld)) {
    selectedWorld.value = preferWorld;
  } else if (!selectedWorld.value || !names.includes(selectedWorld.value)) {
    selectedWorld.value = names[0] ?? null;
  }
}

async function reload() {
  if (!api) return;
  try {
    const { addon_data } = api.getAddonData(latestOpts());
    worlds.value = addon_data ?? {};
    const ui = api.getUiState(latestOpts());
    theme.value = ui.theme === 'dark' ? 'dark' : 'light';
    planeMerge.value = ui.位面交汇 === true;
    const names = Object.keys(worlds.value);
    if (!selectedWorld.value || !names.includes(selectedWorld.value)) {
      selectedWorld.value = names[0] ?? null;
    }
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function toggleTheme() {
  if (!api) return;
  const next = theme.value === 'dark' ? 'light' : 'dark';
  api.setTheme(next, latestOpts());
  theme.value = next;
}

async function onPlaneMerge(value: boolean) {
  if (!api) return;
  api.setPlaneMerge(value, latestOpts());
  planeMerge.value = value;
}

async function onWorldDescent(world: string, value: boolean) {
  if (!api) return;
  applyResult(await api.setWorldDescent(world, value, latestOpts()), world);
}

async function onWorldParallel(world: string, value: boolean) {
  if (!api) return;
  applyResult(await api.setWorldParallel(world, value, latestOpts()), world);
}

async function onCreateWorld(name: string) {
  if (!api) return;
  applyResult(await api.createWorld(name, latestOpts()), name);
}

async function onRenameWorld(oldName: string, newName: string) {
  if (!api) return;
  applyResult(await api.renameWorld(oldName, newName, latestOpts()), newName);
}

async function onSingularity(name: string, value: boolean) {
  if (!api || !selectedWorld.value) return;
  applyResult(await api.setSingularityDescent(selectedWorld.value, name, value, latestOpts()), selectedWorld.value);
}

onMounted(async () => {
  try {
    api = await waitAddon();
    await reload();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>
