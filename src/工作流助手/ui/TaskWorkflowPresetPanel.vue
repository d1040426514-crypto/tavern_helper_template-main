<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PostProcessTask, TaskWorkflowPresetEntry } from '../tasks/schema';
import {
  exportTaskWorkflowPresetsJson,
  parseImportedTaskWorkflowPresets,
} from '../tasks/task-workflow-preset';
import { acuConfirm, acuPrompt } from './composables/useAcuConfirm';
import { acuToast } from './toast';

const props = defineProps<{
  task: PostProcessTask;
}>();

const emit = defineEmits<{
  create: [name: string];
  save: [name: string];
  apply: [name: string];
  delete: [name: string];
  import: [entries: TaskWorkflowPresetEntry[]];
}>();

const selectedPresetName = ref('');
const importFileInput = ref<HTMLInputElement | null>(null);

const presetNames = computed(() => (props.task.taskWorkflowPresets ?? []).map(p => p.name));

async function onSave() {
  const name = await acuPrompt({
    title: '保存工作流预设',
    message: '请输入预设名称：',
    confirmText: '保存',
    danger: false,
    prompt: {
      placeholder: '预设名称',
      defaultValue: selectedPresetName.value || props.task.name,
    },
  });
  if (!name?.trim()) return;
  selectedPresetName.value = name.trim();
  emit('save', name.trim());
}

function nextAvailablePresetName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let index = 2;
  while (existing.includes(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

async function onCreateBlank() {
  const existing = (props.task.taskWorkflowPresets ?? []).map(p => p.name);
  const name = await acuPrompt({
    title: '新建工作流预设',
    message: '创建一个空白工作流预设，并应用到当前任务。若当前设定尚未保存，会先存成「未保存配置」。API 配置与副本调度保持不变。',
    confirmText: '新建',
    danger: false,
    prompt: {
      placeholder: '新预设名称',
      defaultValue: nextAvailablePresetName(existing, '新预设'),
    },
  });
  if (!name?.trim()) return;
  const trimmed = name.trim();
  if (existing.includes(trimmed)) {
    acuToast('warning', `预设「${trimmed}」已存在，请换一个名称`);
    return;
  }
  selectedPresetName.value = trimmed;
  emit('create', trimmed);
}

async function onSaveAsNew() {
  const name = await acuPrompt({
    title: '另存为工作流预设',
    message: '请输入新预设名称：',
    confirmText: '保存',
    danger: false,
    prompt: {
      placeholder: '新预设名称',
      defaultValue: selectedPresetName.value ? `${selectedPresetName.value}-副本` : props.task.name,
    },
  });
  if (!name?.trim()) return;
  if ((props.task.taskWorkflowPresets ?? []).some(p => p.name === name.trim())) {
    acuToast('warning', `预设「${name.trim()}」已存在，请换一个名称`);
    return;
  }
  selectedPresetName.value = name.trim();
  emit('save', name.trim());
}

function onApplyFromSelect(event: Event) {
  const name = (event.target as HTMLSelectElement).value.trim();
  if (!name) return;
  selectedPresetName.value = name;
  emit('apply', name);
}

async function onDelete() {
  const name = selectedPresetName.value.trim();
  if (!name) return;
  if (
    !(await acuConfirm({
      message: `删除工作流预设「${name}」？`,
    }))
  ) {
    return;
  }
  emit('delete', name);
  selectedPresetName.value = '';
}

function triggerImport() {
  importFileInput.value?.click();
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const data: unknown = JSON.parse(text);
    const entries = parseImportedTaskWorkflowPresets(data);
    emit('import', entries);
  } catch (error) {
    console.error('[工作流助手] 导入工作流预设失败:', error);
    acuToast('error', `导入失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exportJson() {
  try {
    const json = exportTaskWorkflowPresetsJson(props.task, selectedPresetName.value || undefined);
    const safeName = (props.task.name?.trim() || 'task').replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `task-workflow-${safeName}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (error) {
    acuToast('warning', error instanceof Error ? error.message : String(error));
  }
}
</script>

<template>
  <div class="acu-subsection task-workflow-preset">
    <h5>工作流预设</h5>
    <p class="acu-notes acu-notes--sm">
      保存本任务除 API 配置与副本族调度外的设定（提示词、执行阶段、提取标签等）。保存写回当前预设，另存为复制当前设定，新建则生成空白预设并应用到本任务。若当前设定尚未保存，仅新建时会先存成「未保存配置」；切换已有预设不会自动保存。
    </p>
    <div class="acu-row acu-preset-toolbar">
      <select
        :value="selectedPresetName"
        class="acu-select acu-preset-select"
        @change="onApplyFromSelect"
      >
        <option value="" disabled>选择预设…</option>
        <option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
      </select>
      <div class="acu-preset-actions">
        <button
          class="acu-btn acu-btn--sm acu-icon-btn"
          type="button"
          title="导入预设"
          aria-label="导入预设"
          @click="triggerImport"
        >
          <i class="fa-fw fa-solid fa-file-import" aria-hidden="true"></i>
        </button>
        <button
          class="acu-btn acu-btn--sm acu-icon-btn"
          type="button"
          title="导出 JSON"
          aria-label="导出 JSON"
          @click="exportJson"
        >
          <i class="fa-fw fa-solid fa-file-export" aria-hidden="true"></i>
        </button>
        <button
          class="acu-btn acu-btn--sm acu-icon-btn primary"
          type="button"
          title="保存预设"
          aria-label="保存预设"
          @click="onSave"
        >
          <i class="fa-fw fa-solid fa-floppy-disk" aria-hidden="true"></i>
        </button>
        <button
          class="acu-btn acu-btn--sm acu-icon-btn"
          type="button"
          title="新建空白预设并应用到当前任务"
          aria-label="新建预设"
          @click="onCreateBlank"
        >
          <i class="fa-fw fa-solid fa-plus" aria-hidden="true"></i>
        </button>
        <button
          class="acu-btn acu-btn--sm acu-icon-btn"
          type="button"
          title="另存为新预设"
          aria-label="另存为新预设"
          @click="onSaveAsNew"
        >
          <i class="fa-fw fa-solid fa-clone" aria-hidden="true"></i>
        </button>
        <button
          class="acu-btn acu-btn--sm acu-icon-btn danger"
          type="button"
          title="删除预设"
          aria-label="删除预设"
          :disabled="!selectedPresetName"
          @click="onDelete"
        >
          <i class="fa-fw fa-solid fa-trash" aria-hidden="true"></i>
        </button>
        <input
          ref="importFileInput"
          type="file"
          accept=".json,application/json"
          hidden
          @change="onImportFile"
        />
      </div>
    </div>
  </div>
</template>
