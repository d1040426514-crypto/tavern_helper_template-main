<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PostProcessTask } from '../tasks/schema';
import { acuPrompt } from './composables/useAcuConfirm';

const props = defineProps<{
  task: PostProcessTask;
}>();

const emit = defineEmits<{
  save: [name: string];
  apply: [name: string];
  delete: [name: string];
}>();

const selectedPresetName = ref('');

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

function onApply() {
  const name = selectedPresetName.value.trim();
  if (!name) return;
  emit('apply', name);
}

function onDelete() {
  const name = selectedPresetName.value.trim();
  if (!name) return;
  emit('delete', name);
}
</script>

<template>
  <div class="acu-subsection task-workflow-preset">
    <h5>工作流预设</h5>
    <p class="acu-notes acu-notes--sm">保存本任务除 API 配置与副本族调度外的设定（提示词、执行阶段、提取标签等）。</p>
    <div class="task-workflow-preset__row">
      <select v-model="selectedPresetName" class="acu-input task-workflow-preset__select">
        <option value="" disabled>选择预设…</option>
        <option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
      </select>
      <button
        type="button"
        class="acu-btn acu-btn--sm acu-icon-btn primary"
        title="保存当前"
        aria-label="保存当前"
        @click="onSave"
      >
        <i class="fa-fw fa-solid fa-floppy-disk" aria-hidden="true"></i>
      </button>
      <button type="button" class="acu-btn acu-btn--sm" :disabled="!selectedPresetName" @click="onApply">应用</button>
      <button type="button" class="acu-btn acu-btn--sm danger" :disabled="!selectedPresetName" @click="onDelete">
        删除
      </button>
    </div>
  </div>
</template>
