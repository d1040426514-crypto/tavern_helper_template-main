<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '../settings';
import { shouldShowEntryInUi } from '../worldbook/blocked';

const { settings } = storeToRefs(useSettingsStore());

const bookFilter = ref('');
const entryFilter = ref('');
const loading = ref(false);
const entryGroups = ref<
  { bookName: string; entries: { uid: number; label: string; checked: boolean; disabled: boolean }[] }[]
>([]);

const cfg = computed(() => settings.value.plotWorldbookConfig);

const worldbookSource = computed({
  get: () => settings.value.plotWorldbookConfig.source,
  set: (value: 'character' | 'manual') => {
    settings.value.plotWorldbookConfig.source = value;
  },
});

const characterBoundBooks = computed(() => {
  try {
    const charBooks = getCharWorldbookNames('current');
    return [charBooks.primary, ...charBooks.additional].filter((name): name is string => Boolean(name));
  } catch {
    return [] as string[];
  }
});

function loadBooks(): string[] {
  try {
    return getWorldbookNames();
  } catch (error) {
    console.error('[AI回复后处理] 获取世界书列表失败:', error);
    return [];
  }
}

const allBooks = ref<string[]>([]);

const filteredBooks = computed(() => {
  const q = bookFilter.value.trim().toLowerCase();
  return allBooks.value.filter(b => !q || b.toLowerCase().includes(q));
});

function toggleBook(name: string) {
  const list = [...settings.value.plotWorldbookConfig.manualSelection];
  const idx = list.indexOf(name);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(name);
  settings.value.plotWorldbookConfig.manualSelection = list;
  void refreshEntries();
}

async function refreshEntries() {
  loading.value = true;
  try {
    let bookNames: string[] = [];
    if (cfg.value.source === 'manual') {
      bookNames = [...cfg.value.manualSelection];
    } else {
      const charBooks = getCharWorldbookNames('current');
      if (charBooks.primary) bookNames.push(charBooks.primary);
      bookNames.push(...charBooks.additional);
    }
    bookNames = [...new Set(bookNames.filter(Boolean))];

    const groups: typeof entryGroups.value = [];
    for (const bookName of bookNames) {
      const entries = await getWorldbook(bookName);
      if (!cfg.value.enabledEntries[bookName]) {
        cfg.value.enabledEntries[bookName] = entries
          .filter(e => shouldShowEntryInUi({ name: e.name }))
          .map(e => e.uid);
      }
      const enabled = cfg.value.enabledEntries[bookName] ?? [];
      const visible = entries
        .filter(e => shouldShowEntryInUi({ name: e.name }))
        .map(e => ({
          uid: e.uid,
          label: e.name || `条目 ${e.uid}`,
          checked: enabled.includes(e.uid),
          disabled: !e.enabled,
        }));
      if (visible.length) groups.push({ bookName, entries: visible });
    }
    entryGroups.value = groups;
  } finally {
    loading.value = false;
  }
}

function toggleEntry(bookName: string, uid: number, checked: boolean) {
  const list = [...(cfg.value.enabledEntries[bookName] ?? [])];
  if (checked) {
    if (!list.includes(uid)) list.push(uid);
  } else {
    const i = list.indexOf(uid);
    if (i >= 0) list.splice(i, 1);
  }
  cfg.value.enabledEntries = { ...cfg.value.enabledEntries, [bookName]: list };
}

function selectAllEntries(select: boolean) {
  const next = { ...cfg.value.enabledEntries };
  for (const g of entryGroups.value) {
    next[g.bookName] = select ? g.entries.map(e => e.uid) : [];
    for (const e of g.entries) e.checked = select;
  }
  cfg.value.enabledEntries = next;
}

const filteredGroups = computed(() => {
  const q = entryFilter.value.trim().toLowerCase();
  if (!q) return entryGroups.value;
  return entryGroups.value
    .map(g => ({
      ...g,
      entries: g.entries.filter(
        e => e.label.toLowerCase().includes(q) || g.bookName.toLowerCase().includes(q),
      ),
    }))
    .filter(g => g.entries.length > 0);
});

watch(
  () => cfg.value.source,
  source => {
    if (source === 'manual') void refreshBookList();
    void refreshEntries();
  },
);

async function refreshBookList() {
  allBooks.value = loadBooks();
}

onMounted(async () => {
  if (cfg.value.source === 'manual') await refreshBookList();
  await refreshEntries();
});
</script>

<template>
  <div class="acu-section">
    <h4>后处理世界书选择（独立）</h4>
    <p class="acu-notes">仅影响本脚本后处理，不会影响数据库插件填表/读取世界书的选择。</p>
    <div class="acu-row">
      <label><input v-model="worldbookSource" type="radio" value="character" /> 角色卡绑定</label>
      <label><input v-model="worldbookSource" type="radio" value="manual" /> 手动选择</label>
    </div>
    <p v-if="cfg.source === 'character'" class="acu-notes">
      当前角色绑定世界书：{{ characterBoundBooks.length ? characterBoundBooks.join('、') : '（无）' }}
    </p>
    <div v-if="cfg.source === 'manual'" class="acu-row">
      <input v-model="bookFilter" class="acu-input" placeholder="筛选世界书..." style="flex: 1" />
      <button class="acu-btn" type="button" @click="refreshBookList">刷新</button>
    </div>
    <div v-if="cfg.source === 'manual'" class="qrf_worldbook_list">
      <div v-if="filteredBooks.length === 0" class="qrf_worldbook_list_item acu-notes">暂无世界书，请点击「刷新」</div>
      <div
        v-for="book in filteredBooks"
        :key="book"
        class="qrf_worldbook_list_item"
        :class="{ selected: cfg.manualSelection.includes(book) }"
        @click="toggleBook(book)"
      >
        {{ book }}
      </div>
    </div>
    <div class="acu-row" style="margin-top: 12px">
      <strong>启用的世界书条目</strong>
      <button class="acu-btn" type="button" @click="selectAllEntries(true)">全选</button>
      <button class="acu-btn" type="button" @click="selectAllEntries(false)">全不选</button>
      <button class="acu-btn" type="button" @click="refreshEntries">刷新条目</button>
    </div>
    <input v-model="entryFilter" class="acu-input" placeholder="筛选条目/世界书..." style="width: 100%; margin-bottom: 8px" />
    <div v-if="loading" class="acu-notes">加载中...</div>
    <div v-else class="qrf_worldbook_entry_list">
      <div v-for="group in filteredGroups" :key="group.bookName">
        <div class="wb-group-title">{{ group.bookName }}</div>
        <label v-for="entry in group.entries" :key="entry.uid" class="acu-row">
          <input
            type="checkbox"
            :checked="(cfg.enabledEntries[group.bookName] ?? []).includes(entry.uid)"
            :disabled="entry.disabled"
            @change="toggleEntry(group.bookName, entry.uid, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ entry.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>
