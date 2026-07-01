<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '../settings';
import type { PostProcessTask } from '../tasks/schema';
import { PLACEHOLDER_LEGEND } from '../tasks/utils';
import { GAME_TIME_FORMAT_HELP } from '../tasks/parse-game-time';
import PlotWorldbookSection from './PlotWorldbookSection.vue';
import ApiConfigPanel from './ApiConfigPanel.vue';
import { BUILTIN_UI_THEMES, applyThemeTokens, updateGlobalTheme } from './theme';
import { ensureAcuToastStyles } from './toast-styles';
import { acuToast } from './toast';

const closeWindow = inject<() => void>('closeSettings', () => {});

const store = useSettingsStore();
const { settings } = storeToRefs(store);

const selectedTaskId = ref(settings.value.tasks[0]?.id ?? '');
const taskPresetNewNameInput = ref('');
const importFileInput = ref<HTMLInputElement | null>(null);
const currentPage = ref(1);

const PAGE_TABS = [
  { id: 1, label: 'API' },
  { id: 2, label: '世界书与上下文' },
  { id: 3, label: '任务' },
  { id: 4, label: '日志' },
] as const;

const UI_THEMES = BUILTIN_UI_THEMES;

function applyUiTheme(themeId: string) {
  updateGlobalTheme(themeId);
  ensureAcuToastStyles(themeId);
  const root = document.querySelector('.acu-pp-root') as HTMLElement | null;
  if (root) {
    applyThemeTokens(root, themeId);
  }
}

function selectUiTheme(themeId: string) {
  settings.value.uiThemeId = themeId;
  applyUiTheme(themeId);
}

function goToPage(page: number) {
  currentPage.value = Math.min(4, Math.max(1, page));
}

const selectedTask = computed(() => settings.value.tasks.find(t => t.id === selectedTaskId.value));

const selectedRoundInterval = computed({
  get: () => selectedTask.value?.schedule?.roundInterval ?? 0,
  set: (v: number) => {
    const task = selectedTask.value;
    if (!task) return;
    task.schedule = task.schedule ?? { mode: 'round' };
    task.schedule.roundInterval = v;
  },
});

const scheduleMode = computed({
  get: (): 'round' | 'time' => {
    const schedule = selectedTask.value?.schedule;
    if (!schedule) return 'round';
    if (schedule.mode) return schedule.mode;
    return schedule.timeInterval?.enabled ? 'time' : 'round';
  },
  set: (v: 'round' | 'time') => {
    const task = selectedTask.value;
    if (!task) return;
    task.schedule = task.schedule ?? { mode: v };
    task.schedule.mode = v;
    ensureTimeInterval(task);
    task.schedule.timeInterval!.enabled = v === 'time';
  },
});

function ensureTimeInterval(task: PostProcessTask) {
  task.schedule = task.schedule ?? { mode: 'round' };
  if (!task.schedule.timeInterval) {
    task.schedule.timeInterval = {
      enabled: false,
      value: 1,
      unit: 'hour',
      timeSource: { type: 'message_tag', tagNames: ['time'], scope: 'current_ai' },
      onParseFail: 'skip',
    };
  }
}

const timeIntervalValue = computed({
  get: () => selectedTask.value?.schedule?.timeInterval?.value ?? 1,
  set: (v: number) => {
    const task = selectedTask.value;
    if (!task) return;
    ensureTimeInterval(task);
    task.schedule!.timeInterval!.value = v;
  },
});

const timeIntervalUnit = computed({
  get: () => selectedTask.value?.schedule?.timeInterval?.unit ?? 'hour',
  set: (v: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year') => {
    const task = selectedTask.value;
    if (!task) return;
    ensureTimeInterval(task);
    task.schedule!.timeInterval!.unit = v;
  },
});

const timeSourceType = computed({
  get: () => selectedTask.value?.schedule?.timeInterval?.timeSource?.type ?? 'message_tag',
  set: (v: 'message_tag' | 'variable') => {
    const task = selectedTask.value;
    if (!task) return;
    ensureTimeInterval(task);
    const ti = task.schedule!.timeInterval!;
    if (v === 'message_tag') {
      ti.timeSource = { type: 'message_tag', tagNames: ['time'], scope: 'current_ai' };
    } else {
      ti.timeSource = { type: 'variable', variableType: 'message', path: '' };
    }
  },
});

const timeTagNames = computed({
  get: () => {
    const src = selectedTask.value?.schedule?.timeInterval?.timeSource;
    return src?.type === 'message_tag' ? src.tagNames.join(',') : 'time';
  },
  set: (v: string) => {
    const task = selectedTask.value;
    if (!task?.schedule?.timeInterval?.timeSource || task.schedule.timeInterval.timeSource.type !== 'message_tag') return;
    task.schedule.timeInterval.timeSource.tagNames = v
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  },
});

const timeTagScope = computed({
  get: () => {
    const src = selectedTask.value?.schedule?.timeInterval?.timeSource;
    return src?.type === 'message_tag' ? src.scope : 'current_ai';
  },
  set: (v: 'current_ai' | 'current_pair') => {
    const task = selectedTask.value;
    if (!task?.schedule?.timeInterval?.timeSource || task.schedule.timeInterval.timeSource.type !== 'message_tag') return;
    task.schedule.timeInterval.timeSource.scope = v;
  },
});

const timeVariableType = computed({
  get: () => {
    const src = selectedTask.value?.schedule?.timeInterval?.timeSource;
    return src?.type === 'variable' ? src.variableType : 'message';
  },
  set: (v: 'chat' | 'global' | 'message' | 'script' | 'character') => {
    const task = selectedTask.value;
    if (!task?.schedule?.timeInterval?.timeSource || task.schedule.timeInterval.timeSource.type !== 'variable') return;
    task.schedule.timeInterval.timeSource.variableType = v;
  },
});

const timeVariablePath = computed({
  get: () => {
    const src = selectedTask.value?.schedule?.timeInterval?.timeSource;
    return src?.type === 'variable' ? src.path : '';
  },
  set: (v: string) => {
    const task = selectedTask.value;
    if (!task?.schedule?.timeInterval?.timeSource || task.schedule.timeInterval.timeSource.type !== 'variable') return;
    task.schedule.timeInterval.timeSource.path = v;
  },
});

const showMvuDeferHint = computed(
  () =>
    scheduleMode.value === 'time' &&
    timeSourceType.value === 'variable' &&
    timeVariableType.value === 'message',
);

const timeOnParseFail = computed({
  get: () => selectedTask.value?.schedule?.timeInterval?.onParseFail ?? 'skip',
  set: (v: 'skip' | 'run' | 'wall_clock') => {
    const task = selectedTask.value;
    if (!task) return;
    ensureTimeInterval(task);
    task.schedule!.timeInterval!.onParseFail = v;
  },
});

function newTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function addTask() {
  const task: PostProcessTask = {
    id: newTaskId(),
    name: '新任务',
    enabled: true,
    stage: 1,
    order: settings.value.tasks.length,
    extractInjectTags: ['result'],
    mergeStrategy: 'concat',
    maxRetries: 3,
    minLength: 0,
    apiPresetName: '',
    promptGroups: [{ role: 'user', content: '当前 AI 回复：$7' }],
  };
  settings.value.tasks.push(task);
  selectedTaskId.value = task.id;
}

function removeTask(id: string) {
  settings.value.tasks = settings.value.tasks.filter(t => t.id !== id);
  if (selectedTaskId.value === id) {
    selectedTaskId.value = settings.value.tasks[0]?.id ?? '';
  }
}

function movePromptGroup(index: number, delta: -1 | 1): void {
  const task = selectedTask.value;
  if (!task) return;
  const groups = task.promptGroups;
  const target = index + delta;
  if (target < 0 || target >= groups.length) return;
  const [item] = groups.splice(index, 1);
  groups.splice(target, 0, item);
}

function applyBuiltinPreset(name: string) {
  store.applyPreset(name);
  selectedTaskId.value = settings.value.tasks[0]?.id ?? '';
}

async function handleRerun() {
  const { rerunCurrentFloor } = await import('../tasks/trigger');
  await rerunCurrentFloor();
  store.reload();
}

function saveTaskPreset() {
  if (!settings.value.activePresetName.trim()) {
    acuToast('warning','请先选择当前预设');
    return;
  }
  if (store.saveActivePreset()) {
    acuToast('success',`预设「${settings.value.activePresetName}」已保存`);
  }
}

function saveTaskPresetAsNew() {
  const name = taskPresetNewNameInput.value.trim();
  if (!name) {
    acuToast('warning','请输入新预设名称');
    return;
  }
  if (settings.value.presets.some(p => p.name === name)) {
    acuToast('warning',`预设「${name}」已存在，请换一个名称`);
    return;
  }
  const saved = store.saveAsNewPreset(name);
  if (saved) {
    taskPresetNewNameInput.value = '';
    acuToast('success',`已保存为新预设「${saved}」`);
  }
}

function exportPresetJson() {
  const blob = new Blob([JSON.stringify(settings.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ai-post-process-settings.json';
  a.click();
}

function triggerImportPreset() {
  importFileInput.value?.click();
}

async function onImportPresetFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const data: unknown = JSON.parse(text);
    const name = store.importPresetFromJson(data, file.name);
    selectedTaskId.value = settings.value.tasks[0]?.id ?? '';
    acuToast('success',`已导入并应用预设「${name}」`);
  } catch (error) {
    console.error('[AI回复后处理] 导入预设失败:', error);
    acuToast('error',`导入预设失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function addContextExtractRule() {
  settings.value.contextExtractRules.push({ start: '', end: '' });
}

function removeContextExtractRule(index: number) {
  settings.value.contextExtractRules.splice(index, 1);
}

function addContextExcludeRule() {
  settings.value.contextExcludeRules.push({ start: '', end: '' });
}

function removeContextExcludeRule(index: number) {
  settings.value.contextExcludeRules.splice(index, 1);
}

function formatRunLogTime(at?: number): string {
  if (!at) return '';
  return new Date(at).toLocaleString('zh-CN');
}

function runLogStatusText(r: {
  skipped?: boolean;
  skipReason?: string;
  success?: boolean;
}): string {
  if (r.skipped) return `跳过${r.skipReason ? `（${r.skipReason}）` : ''}`;
  if (r.success) return '成功';
  return '失败';
}

function runLogHadApiRequest(r: {
  skipped?: boolean;
  promptMessages?: unknown[];
}): boolean {
  return !r.skipped && (r.promptMessages?.length ?? 0) > 0;
}

function runLogAiOutputText(r: { aiOutput?: string }): string {
  return String(r.aiOutput ?? '').trim();
}

function runLogAiReasoningText(r: { aiReasoning?: string }): string {
  return String(r.aiReasoning ?? '').trim();
}
</script>

<template>
  <div class="acu-overlay acu-pp-root" @click.self="closeWindow">
    <div class="acu-window">
      <div class="acu-window-header">
        <div class="acu-window-title">
          <span class="acu-window-title-mark">后</span>
          <span>AI 回复后处理 · 设置</span>
        </div>
        <div class="acu-window-header-end">
          <div class="acu-theme-switch" role="group" aria-label="界面主题">
            <button
              v-for="theme in UI_THEMES"
              :key="theme.id"
              type="button"
              class="acu-theme-btn"
              :class="{ active: settings.uiThemeId === theme.id }"
              :title="theme.name"
              @click="selectUiTheme(theme.id)"
            >
              {{ theme.name }}
            </button>
          </div>
          <button class="acu-btn acu-window-close" type="button" title="关闭" @click="closeWindow">×</button>
        </div>
      </div>
      <div class="acu-page-tabs">
        <button
          v-for="tab in PAGE_TABS"
          :key="tab.id"
          type="button"
          class="acu-page-tab"
          :class="{ active: currentPage === tab.id }"
          @click="goToPage(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="acu-window-body">
        <div v-show="currentPage === 1" class="acu-page">
          <div class="acu-section">
            <label class="acu-row">
              <input v-model="settings.enabled" type="checkbox" />
              启用 AI 回复后处理
            </label>
          </div>

          <ApiConfigPanel />
        </div>

        <div v-show="currentPage === 2" class="acu-page">
          <PlotWorldbookSection />

          <div class="acu-section">
            <h4>标签筛选（$7 上下文）</h4>
            <div class="acu-row">
              <label>最近</label>
              <input v-model.number="settings.contextTurnCount" class="acu-input" type="number" min="0" step="1" style="width: 72px" />
              <span>条 AI 楼层作为 $7 占位符上下文</span>
              <span class="acu-notes">（0 = 不注入历史 AI 正文）</span>
            </div>
            <div class="acu-subsection">
              <h5>提取规则</h5>
              <p class="acu-notes">对每条 AI 楼正文，仅保留匹配以下「开始词～结束词」边界的最后一次出现片段（先提取后排除）。开始词可填残缺开标签（如 <code>&lt;tp</code>），可匹配 <code>&lt;tp&gt;</code>、<code>&lt;tp="…"&gt;</code> 等形式；结束词请写完整边界（如 <code>&lt;/tp&gt;</code>）。</p>
              <div v-for="(rule, idx) in settings.contextExtractRules" :key="'ex-' + idx" class="acu-row">
                <input v-model="rule.start" class="acu-input" placeholder="开始词（如 &lt;tp 或 &lt;think&gt;）" style="flex: 1" />
                <input v-model="rule.end" class="acu-input" placeholder="结束词（如 &lt;/think&gt;）" style="flex: 1" />
                <button class="acu-btn danger" type="button" @click="removeContextExtractRule(idx)">删除</button>
              </div>
              <button class="acu-btn" type="button" @click="addContextExtractRule">+ 添加提取规则</button>
            </div>
            <div class="acu-subsection">
              <h5>排除规则</h5>
              <p class="acu-notes">对每条 AI 楼正文，移除匹配以下边界的最后一次出现片段。开始词支持残缺开标签前缀（如 <code>&lt;tp</code>），结束词请写完整边界。</p>
              <div v-for="(rule, idx) in settings.contextExcludeRules" :key="'rm-' + idx" class="acu-row">
                <input v-model="rule.start" class="acu-input" placeholder="开始词（如 &lt;tp 或 &lt;thinking&gt;）" style="flex: 1" />
                <input v-model="rule.end" class="acu-input" placeholder="结束词（如 &lt;/thinking&gt;）" style="flex: 1" />
                <button class="acu-btn danger" type="button" @click="removeContextExcludeRule(idx)">删除</button>
              </div>
              <button class="acu-btn" type="button" @click="addContextExcludeRule">+ 添加排除规则</button>
            </div>
          </div>

          <div class="acu-section">
            <h4>占位符说明</h4>
            <div class="acu-placeholder-legend">
              <div v-for="item in PLACEHOLDER_LEGEND" :key="item.code" class="acu-placeholder-item">
                <code>{{ item.code }}</code> — {{ item.desc }}
              </div>
              <p class="acu-notes" style="margin-top: 8px; margin-bottom: 0">
                相同执行阶段的任务并行执行；不同阶段按阶段号从小到大串行执行。任务完成后按「提取写入标签」从输出中摘取各标签最后一次出现，供后续阶段的
                <code v-pre>{{标签名}}</code> 占位符使用。
              </p>
            </div>
          </div>
        </div>

        <div v-show="currentPage === 3" class="acu-page">
          <div class="acu-section acu-preset-section">
            <h4>预设</h4>
            <p class="acu-notes">切换预设会加载对应任务模板；修改后请点击「保存预设」写回当前预设，或填写新名称后「重命名并保存为新预设」。</p>
            <div class="acu-row">
              <label class="acu-field-label">当前预设</label>
              <select
                :value="settings.activePresetName"
                class="acu-select"
                style="flex: 2"
                @change="applyBuiltinPreset(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="p in settings.presets" :key="p.name" :value="p.name">{{ p.name }}</option>
              </select>
            </div>
            <div class="acu-row acu-preset-actions">
              <button class="acu-btn acu-btn--sm" type="button" @click="triggerImportPreset">导入预设</button>
              <button class="acu-btn acu-btn--sm" type="button" @click="exportPresetJson">导出 JSON</button>
              <button class="acu-btn acu-btn--sm primary" type="button" @click="saveTaskPreset">保存预设</button>
              <input
                ref="importFileInput"
                type="file"
                accept=".json,application/json"
                hidden
                @change="onImportPresetFile"
              />
            </div>
            <div class="acu-row acu-preset-rename-row">
              <input
                v-model="taskPresetNewNameInput"
                class="acu-input acu-input--sm"
                placeholder="新预设名称"
                style="flex: 2"
              />
              <button class="acu-btn acu-btn--sm" type="button" @click="saveTaskPresetAsNew">重命名并保存为新预设</button>
            </div>
          </div>

          <div class="acu-section">
            <h4>后处理任务</h4>
            <div class="acu-task-tabs">
              <span
                v-for="task in settings.tasks"
                :key="task.id"
                class="task-card"
                :class="{ active: task.id === selectedTaskId }"
                @click="selectedTaskId = task.id"
              >
                {{ task.name }}
              </span>
              <button class="acu-btn" type="button" @click="addTask">+ 添加</button>
            </div>
            <div v-if="selectedTask" class="acu-task-editor">
              <div class="acu-row">
                <input v-model="selectedTask.name" class="acu-input" placeholder="任务名称" />
                <label><input v-model="selectedTask.enabled" type="checkbox" /> 启用</label>
                <button class="acu-btn danger" type="button" @click="removeTask(selectedTask.id)">删除</button>
              </div>
              <div class="acu-row">
                <label>执行阶段</label>
                <input v-model.number="selectedTask.stage" class="acu-input" type="number" min="1" step="1" title="相同阶段并行，不同阶段串行" />
                <label>同阶段结果排列顺序</label>
                <input v-model.number="selectedTask.order" class="acu-input" type="number" min="0" step="1" />
                <label>API 预设</label>
                <select v-model="selectedTask.apiPresetName" class="acu-select">
                  <option value="">全局默认</option>
                  <option v-for="p in settings.apiPresets" :key="p.name" :value="p.name">{{ p.name }}</option>
                </select>
              </div>
              <div class="acu-subsection">
                <h5>执行策略</h5>
                <p class="acu-notes">回合间隔与时间间隔分别配置，选择其中一项逻辑执行（手动重跑忽略调度）。</p>
                <div class="acu-row">
                  <label><input v-model="scheduleMode" type="radio" value="round" /> 按回合间隔</label>
                  <label><input v-model="scheduleMode" type="radio" value="time" /> 按游戏时间间隔</label>
                </div>
                <div v-if="scheduleMode === 'round'" class="acu-row">
                  <label>每隔</label>
                  <input v-model.number="selectedRoundInterval" class="acu-input" type="number" min="0" step="1" style="width: 72px" />
                  <span>回合执行一次</span>
                  <span class="acu-notes">（0 或 1 = 每楼都执行）</span>
                </div>
                <template v-if="scheduleMode === 'time'">
                  <div class="acu-row">
                    <label>每隔</label>
                    <input v-model.number="timeIntervalValue" class="acu-input" type="number" min="1" step="1" style="width: 72px" />
                    <select v-model="timeIntervalUnit" class="acu-select">
                      <option value="minute">分钟</option>
                      <option value="hour">小时</option>
                      <option value="day">天</option>
                      <option value="week">周</option>
                      <option value="month">月</option>
                      <option value="year">年</option>
                    </select>
                    <span>游戏时间执行一次</span>
                  </div>
                  <p v-if="showMvuDeferHint" class="acu-notes">
                    使用最新消息楼层变量（stat_data）作为游戏时间时，全部任务将在 MVU 变量更新完成后再执行。
                  </p>
                  <div class="acu-row">
                    <label>时间数据来源</label>
                    <label><input v-model="timeSourceType" type="radio" value="message_tag" /> 正文标签</label>
                    <label><input v-model="timeSourceType" type="radio" value="variable" /> 楼层变量</label>
                  </div>
                  <template v-if="timeSourceType === 'message_tag'">
                    <div class="acu-row">
                      <label>标签名（逗号分隔）</label>
                      <input v-model="timeTagNames" class="acu-input" placeholder="time, 世界时间" style="flex: 1" />
                    </div>
                    <div class="acu-row">
                      <label>扫描范围</label>
                      <select v-model="timeTagScope" class="acu-select">
                        <option value="current_ai">当前 AI 楼正文</option>
                        <option value="current_pair">本轮 user+AI 正文</option>
                      </select>
                    </div>
                  </template>
                  <template v-else>
                    <div class="acu-row">
                      <label>变量域</label>
                      <select v-model="timeVariableType" class="acu-select">
                        <option value="message">最新消息楼层</option>
                        <option value="chat">聊天变量</option>
                        <option value="global">全局变量</option>
                        <option value="character">角色变量</option>
                        <option value="script">脚本变量</option>
                      </select>
                      <input v-model="timeVariablePath" class="acu-input" placeholder="变量路径，如 stat_data.世界.当前时间" style="flex: 2" />
                    </div>
                  </template>
                  <div class="acu-row">
                    <label>时间解析失败时</label>
                    <select v-model="timeOnParseFail" class="acu-select">
                      <option value="skip">跳过本任务</option>
                      <option value="run">仍执行</option>
                      <option value="wall_clock">使用系统时间</option>
                    </select>
                  </div>
                  <div class="acu-game-time-format-hint">
                    <p class="acu-notes acu-notes--sm acu-game-time-format-hint__title">支持的时间格式</p>
                    <p class="acu-notes acu-notes--sm">{{ GAME_TIME_FORMAT_HELP.preprocess }}</p>
                    <ul class="acu-game-time-format-list">
                      <li
                        v-for="(line, idx) in GAME_TIME_FORMAT_HELP.examples"
                        :key="idx"
                        class="acu-notes acu-notes--sm"
                      >
                        {{ line }}
                      </li>
                    </ul>
                    <p class="acu-notes acu-notes--sm">{{ GAME_TIME_FORMAT_HELP.footnote }}</p>
                  </div>
                </template>
              </div>
              <div class="acu-row">
                <label>提取写入标签</label>
                <input
                  class="acu-input"
                  style="flex: 1"
                  placeholder="如 recall,supplement"
                  :value="(selectedTask.extractInjectTags ?? []).join(',')"
                  @input="selectedTask.extractInjectTags = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
                />
              </div>
              <p class="acu-notes" style="margin: 0 0 8px">
                <strong>提取写入标签</strong>：从任务输出摘取标签内容，供「消息楼层标签变量注入」与「聊天注入设置」模板中显式的 <code v-pre>{{标签名}}</code> 使用；提示词中首次缺同轮 relay 时，正常后处理读当前楼 <code>post_process_tags</code>（含继承），重跑后处理任务读上一楼；之后仍走阶段中转。
              </p>
              <div class="acu-row">
                <label>最大重试次数</label>
                <input v-model.number="selectedTask.maxRetries" class="acu-input" type="number" min="1" step="1" style="width: 96px" />
              </div>
              <div v-for="(pg, idx) in selectedTask.promptGroups" :key="idx" class="acu-prompt-group">
                <div class="acu-row acu-prompt-group__toolbar">
                  <select v-model="pg.role" class="acu-select">
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                  <button
                    class="acu-btn acu-btn--sm"
                    type="button"
                    title="上移"
                    :disabled="idx === 0"
                    @click="movePromptGroup(idx, -1)"
                  >
                    上移
                  </button>
                  <button
                    class="acu-btn acu-btn--sm"
                    type="button"
                    title="下移"
                    :disabled="idx === selectedTask.promptGroups.length - 1"
                    @click="movePromptGroup(idx, 1)"
                  >
                    下移
                  </button>
                  <button class="acu-btn danger acu-btn--sm" type="button" @click="selectedTask.promptGroups.splice(idx, 1)">删段</button>
                </div>
                <textarea v-model="pg.content" class="acu-textarea" />
              </div>
              <button class="acu-btn" type="button" @click="selectedTask.promptGroups.push({ role: 'user', content: '' })">
                + 提示词段
              </button>
            </div>
          </div>

          <div class="acu-section">
            <h4>消息楼层标签变量注入</h4>
            <p class="acu-notes" style="margin-top: 0">
              仅模板中显式出现的 <code v-pre>{{标签名}}</code> 会写入当前 AI 楼消息变量 <code>post_process_tags.{标签名}</code>（标签内文）。变量随楼层自动继承。
            </p>
            <textarea
              v-model="settings.tagVariableInjectTemplate"
              class="acu-textarea"
              placeholder="如 &lt;qc&gt;{{consistency}}&lt;/qc&gt;，可用 {{task:任务名}}"
            />
          </div>

          <div class="acu-section">
            <h4>聊天注入设置</h4>
            <p class="acu-notes" style="margin-top: 0">
              渲染后原样追加到 AI 回复文末；请在模板内自行编写所需内容与 <code v-pre>{{标签名}}</code>。不写入消息楼层变量。
              若注入内容含 <code>&lt;JSONPatch&gt;</code> / <code>&lt;AddonJSONPatch&gt;</code>，注入后将分别触发 MVU <code>stat_data</code> 与 <code>addon_data</code> 更新（仅解析注入块，各一次）。
            </p>
            <textarea v-model="settings.finalInjectTemplate" class="acu-textarea" placeholder="finalInjectTemplate，可用 {{task:任务名}} 与 {{提取写入标签名}}" />
          </div>
        </div>

        <div v-show="currentPage === 4" class="acu-page">
          <div class="acu-section">
            <h4>运行日志</h4>
            <div v-if="settings.lastRunStatus.messageId != null" class="acu-notes" style="margin-bottom: 10px">
              当前楼层 #{{ settings.lastRunStatus.messageId }}
              <span v-if="settings.lastRunStatus.at"> · {{ formatRunLogTime(settings.lastRunStatus.at) }}</span>
            </div>
            <div v-if="settings.lastRunStatus.taskResults?.length">
              <div v-for="r in settings.lastRunStatus.taskResults" :key="r.taskId" class="acu-run-log-card">
                <div class="acu-run-log-header">
                  <strong>{{ r.taskName }}</strong>
                  <span v-if="r.stage != null" class="acu-notes">阶段 {{ r.stage }}</span>
                  <span :class="r.skipped ? 'acu-log-warn' : r.success ? 'acu-log-ok' : 'acu-log-err'">
                    {{ runLogStatusText(r) }}
                  </span>
                  <span v-if="r.durationMs != null" class="acu-notes">{{ r.durationMs }}ms</span>
                </div>
                <template v-if="r.promptMessages?.length">
                  <div class="acu-run-log-label">请求提示词</div>
                  <div v-for="(msg, idx) in r.promptMessages" :key="idx" class="acu-run-log-block">
                    <div class="acu-run-log-role">[{{ msg.role }}]</div>
                    <pre class="acu-run-log-pre">{{ msg.content }}</pre>
                  </div>
                </template>
                <template v-else-if="r.skipped || !r.success">
                  <div class="acu-run-log-label">请求提示词</div>
                  <div class="acu-notes">（本任务未发起 API 请求）</div>
                </template>
                <div v-if="runLogHadApiRequest(r)" class="acu-run-log-output-section">
                  <div class="acu-run-log-label">AI 输出</div>
                  <pre v-if="runLogAiOutputText(r)" class="acu-run-log-pre">{{ runLogAiOutputText(r) }}</pre>
                  <div v-else class="acu-notes">（无输出内容）</div>
                </div>
                <div v-if="runLogAiReasoningText(r)" class="acu-run-log-reasoning-section">
                  <div class="acu-run-log-label">推理内容 (reasoning_content)</div>
                  <pre class="acu-run-log-pre acu-run-log-pre--reasoning">{{ runLogAiReasoningText(r) }}</pre>
                </div>
              </div>
            </div>
            <div v-else class="acu-notes">尚无运行记录</div>
          </div>
        </div>
      </div>
      <div class="acu-window-footer">
        <div class="acu-footer-nav">
          <button class="acu-btn" type="button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">上一页</button>
          <span class="acu-page-indicator">{{ currentPage }} / 4</span>
          <button class="acu-btn" type="button" :disabled="currentPage >= 4" @click="goToPage(currentPage + 1)">下一页</button>
        </div>
        <div class="acu-footer-actions">
          <button class="acu-btn" type="button" @click="handleRerun">重跑后处理任务</button>
          <button class="acu-btn" type="button" @click="closeWindow">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./acu-theme.css"></style>
