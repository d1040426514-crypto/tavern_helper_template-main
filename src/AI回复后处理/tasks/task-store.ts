import { findApiPreset, resolveTaskApiPreset } from '../api/resolve';
import { loadSettings, saveSettings } from '../settings';
import {
  buildChatSnapshotFromSettings,
  clearChatTaskScope,
  ensureChatOverride,
  readChatTaskScope,
  writeChatTaskScope,
  isChatOverrideActive,
} from './chat-task-scope';
import { resolveEffectiveSettings } from './effective-settings';
import { emitChatScopeChanged, emitTasksChanged } from './events';
import {
  PostProcessPresetSchema,
  PostProcessTaskSchema,
  ChatTaskScopeStateSchema,
  type ChatTaskScopeState,
  type PostProcessTask,
  type ScriptSettings,
} from './schema';
import { newTaskId, cloneTaskForInsert } from './task-clone';
import {
  appendPromptGroup,
  movePromptGroupAt,
  removePromptGroupAt,
} from './prompt-group-ops';
import { mergeTaskSchedule, parseTaskSchedule, type TaskSchedulePatch } from './task-schedule-merge';
import {
  mergeTaskExecutionOptions,
  normalizeExtractInjectTags,
  type TaskExecutionOptionsPatch,
} from './task-extract-tags-merge';
import type { PlotWorldbookConfig, TaskContextConfig } from './schema';
import type { z } from 'zod';
import { PromptGroupSchema } from './schema';

export type TaskWriteSource = 'api' | 'ui';

export type { TaskSchedulePatch } from './task-schedule-merge';
export type { TaskExecutionOptionsPatch } from './task-extract-tags-merge';

export type PresetFieldsPatch = Partial<{
  contextTurnCount: number;
  contextExtractRules: ScriptSettings['contextExtractRules'];
  contextExcludeRules: ScriptSettings['contextExcludeRules'];
  plotWorldbookConfig: PlotWorldbookConfig;
  taskPlotWorldbookOverridesEnabled: boolean;
  taskContextOverridesEnabled: boolean;
  finalInjectTemplate: string;
  tagVariableInjectTemplate: string;
}>;

type PromptGroup = z.infer<typeof PromptGroupSchema>;

function defaultTaskFields(): PostProcessTask {
  return PostProcessTaskSchema.parse({
    id: newTaskId(),
    name: '新任务',
    enabled: true,
    stage: 1,
    extractInjectTags: ['result'],
    mergeStrategy: 'concat',
    maxRetries: 3,
    minLength: 0,
    apiPresetName: '',
    plotWorldbookMode: 'inherit',
    contextMode: 'inherit',
    promptGroups: [{ name: '', role: 'user', content: '当前 AI 回复：$7', enabled: true }],
  });
}

function cleanupTaskRuntimeState(settings: ScriptSettings, taskId: string): void {
  delete settings.scheduleState[taskId];
  delete settings.taskApiPresetOverridesById[taskId];
}

async function persistSnapshotTasks(
  settings: ScriptSettings,
  tasks: PostProcessTask[],
  source: TaskWriteSource,
): Promise<ChatTaskScopeState> {
  const wasActive = isChatOverrideActive(readChatTaskScope());
  const scope = await ensureChatOverride(settings, source);
  const snapshot = PostProcessPresetSchema.parse({
    ...scope.snapshot!,
    tasks: _.cloneDeep(tasks),
  });
  const next = ChatTaskScopeStateSchema.parse({
    ...scope,
    snapshot,
    updatedAt: Date.now(),
    source,
  });
  await writeChatTaskScope(next);
  if (!wasActive) {
    await emitChatScopeChanged('chat_override', next.originPresetName);
  }
  return next;
}

async function persistGlobalTasks(settings: ScriptSettings, tasks: PostProcessTask[]): Promise<void> {
  settings.tasks = _.cloneDeep(tasks);
  saveSettings(settings);
}

async function writeTasks(
  settings: ScriptSettings,
  tasks: PostProcessTask[],
  source: TaskWriteSource,
): Promise<void> {
  const useSnapshot = source === 'api' || isChatOverrideActive(readChatTaskScope());
  if (useSnapshot) {
    await persistSnapshotTasks(settings, tasks, source);
  } else {
    await persistGlobalTasks(settings, tasks);
  }
}

export function listTasks(): PostProcessTask[] {
  const settings = loadSettings();
  return _.cloneDeep(resolveEffectiveSettings(settings).tasks);
}

export function getTask(id: string): PostProcessTask | null {
  return listTasks().find(t => t.id === id) ?? null;
}

export async function createTask(
  input?: Partial<PostProcessTask>,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const settings = loadSettings();
  const tasks = listTasks();
  const task = PostProcessTaskSchema.parse({
    ...defaultTaskFields(),
    ...input,
    id: input?.id?.trim() || newTaskId(),
  });
  tasks.push(task);
  await writeTasks(settings, tasks, source);
  await emitTasksChanged('create', source, task.id);
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<PostProcessTask>,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const settings = loadSettings();
  const tasks = listTasks();
  const index = tasks.findIndex(t => t.id === id);
  if (index < 0) {
    throw new Error(`任务不存在: ${id}`);
  }
  const updated = PostProcessTaskSchema.parse({
    ...tasks[index],
    ...patch,
    id,
  });
  tasks[index] = updated;
  await writeTasks(settings, tasks, source);
  await emitTasksChanged('update', source, id);
  return updated;
}

export async function deleteTask(id: string, source: TaskWriteSource = 'api'): Promise<boolean> {
  const settings = loadSettings();
  const tasks = listTasks();
  if (!tasks.some(t => t.id === id)) return false;
  const next = tasks.filter(t => t.id !== id);
  cleanupTaskRuntimeState(settings, id);
  saveSettings(settings);
  await writeTasks(settings, next, source);
  await emitTasksChanged('delete', source, id);
  return true;
}

export async function replaceTasks(
  tasks: PostProcessTask[],
  source: TaskWriteSource = 'api',
): Promise<void> {
  const settings = loadSettings();
  const parsed = tasks.map(t => PostProcessTaskSchema.parse(t));
  await writeTasks(settings, parsed, source);
  await emitTasksChanged('replace', source);
}

export function getChatScopeState(): ChatTaskScopeState | null {
  return readChatTaskScope();
}

export async function clearChatScope(source: TaskWriteSource = 'api'): Promise<void> {
  const prev = readChatTaskScope();
  await clearChatTaskScope();
  await emitChatScopeChanged('inherit_global', prev?.originPresetName);
  await emitTasksChanged('clear', source);
}

export async function promoteChatScopeToPreset(name?: string): Promise<string | null> {
  const scope = readChatTaskScope();
  if (!scope?.snapshot) return null;
  const settings = loadSettings();
  const presetName = name?.trim() || `聊天快照-${new Date().toLocaleString('zh-CN')}`;
  if (settings.presets.some(p => p.name === presetName)) return null;

  const preset = PostProcessPresetSchema.parse({
    ...scope.snapshot,
    name: presetName,
  });
  settings.presets.push(_.cloneDeep(preset));
  settings.activePresetName = presetName;
  settings.tasks = _.cloneDeep(preset.tasks);
  settings.finalInjectTemplate = preset.finalInjectTemplate;
  settings.tagVariableInjectTemplate = preset.tagVariableInjectTemplate;
  settings.contextTurnCount = preset.contextTurnCount;
  settings.contextExtractRules = _.cloneDeep(preset.contextExtractRules);
  settings.contextExcludeRules = _.cloneDeep(preset.contextExcludeRules);
  settings.plotWorldbookConfig = _.cloneDeep(preset.plotWorldbookConfig);
  settings.taskPlotWorldbookOverridesEnabled = preset.taskPlotWorldbookOverridesEnabled ?? false;
  settings.taskContextOverridesEnabled = preset.taskContextOverridesEnabled ?? false;
  saveSettings(settings);
  await clearChatTaskScope();
  await emitChatScopeChanged('inherit_global', scope.originPresetName);
  return presetName;
}

/** 将当前 effective 预设字段同步回聊天快照（UI 编辑上下文等字段时） */
export async function syncEffectivePresetFieldsToChatScope(
  fields: Partial<ReturnType<typeof buildChatSnapshotFromSettings>>,
  source: TaskWriteSource = 'ui',
): Promise<void> {
  if (!isChatOverrideActive(readChatTaskScope())) return;
  const settings = loadSettings();
  const scope = await ensureChatOverride(settings, source);
  const snapshot = PostProcessPresetSchema.parse({
    ...scope.snapshot!,
    ...fields,
  });
  await writeChatTaskScope(
    ChatTaskScopeStateSchema.parse({
      ...scope,
      snapshot,
      updatedAt: Date.now(),
      source,
    }),
  );
}

export function hasActiveChatTaskScope(): boolean {
  return isChatOverrideActive(readChatTaskScope());
}

export async function updatePresetFields(
  fields: PresetFieldsPatch,
  source: TaskWriteSource = 'api',
): Promise<void> {
  const settings = loadSettings();
  const useSnapshot = source === 'api' || isChatOverrideActive(readChatTaskScope());

  if (useSnapshot) {
    const wasActive = isChatOverrideActive(readChatTaskScope());
    const scope = await ensureChatOverride(settings, source);
    const snapshot = PostProcessPresetSchema.parse({
      ...scope.snapshot!,
      ..._.cloneDeep(fields),
    });
    const next = ChatTaskScopeStateSchema.parse({
      ...scope,
      snapshot,
      updatedAt: Date.now(),
      source,
    });
    await writeChatTaskScope(next);
    if (!wasActive) {
      await emitChatScopeChanged('chat_override', next.originPresetName);
    }
  } else {
    Object.assign(settings, _.cloneDeep(fields));
    saveSettings(settings);
  }
  await emitTasksChanged('preset', source);
}

export async function updateTaskPlotWorldbook(
  id: string,
  input: { mode?: 'inherit' | 'custom'; config?: PlotWorldbookConfig },
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const patch: Partial<PostProcessTask> = {};
  if (input.mode !== undefined) patch.plotWorldbookMode = input.mode;
  if (input.config !== undefined) patch.plotWorldbookConfig = input.config;
  return updateTask(id, patch, source);
}

export async function updateTaskContext(
  id: string,
  input: { mode?: 'inherit' | 'custom'; config?: TaskContextConfig },
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const patch: Partial<PostProcessTask> = {};
  if (input.mode !== undefined) patch.contextMode = input.mode;
  if (input.config !== undefined) patch.contextConfig = input.config;
  return updateTask(id, patch, source);
}

export async function updatePromptGroup(
  id: string,
  index: number,
  patch: Partial<PromptGroup>,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const task = getTask(id);
  if (!task) throw new Error(`任务不存在: ${id}`);
  if (index < 0 || index >= task.promptGroups.length) {
    throw new Error(`提示词段索引无效: ${index}`);
  }
  const groups = _.cloneDeep(task.promptGroups);
  groups[index] = { ...groups[index], ...patch };
  return updateTask(id, { promptGroups: groups }, source);
}

export async function updateTaskStage(
  id: string,
  stage: number,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  if (!Number.isInteger(stage) || stage < 1) {
    throw new Error(`执行阶段无效: ${stage}（须为 >= 1 的整数）`);
  }
  return updateTask(id, { stage }, source);
}

export async function updateTaskSchedule(
  id: string,
  patch: TaskSchedulePatch,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const task = getTask(id);
  if (!task) throw new Error(`任务不存在: ${id}`);
  const schedule = parseTaskSchedule(mergeTaskSchedule(task.schedule, patch));
  return updateTask(id, { schedule }, source);
}

export async function duplicateTask(
  id: string,
  options?: { afterTaskId?: string },
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const tasks = listTasks();
  const sourceTask = tasks.find(t => t.id === id);
  if (!sourceTask) throw new Error(`任务不存在: ${id}`);
  const cloned = cloneTaskForInsert(sourceTask, tasks);
  const next = [...tasks];
  const afterId = options?.afterTaskId ?? id;
  const insertAt = next.findIndex(t => t.id === afterId);
  if (insertAt >= 0) next.splice(insertAt + 1, 0, cloned);
  else next.push(cloned);
  const settings = loadSettings();
  await writeTasks(settings, next, source);
  await emitTasksChanged('create', source, cloned.id);
  return cloned;
}

export async function moveTask(
  id: string,
  delta: -1 | 1,
  source: TaskWriteSource = 'api',
): Promise<void> {
  const tasks = listTasks();
  const index = tasks.findIndex(t => t.id === id);
  if (index < 0) throw new Error(`任务不存在: ${id}`);
  const target = index + delta;
  if (target < 0 || target >= tasks.length) return;
  const next = [...tasks];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  const settings = loadSettings();
  await writeTasks(settings, next, source);
  await emitTasksChanged('replace', source);
}

export async function moveTaskToIndex(
  id: string,
  toIndex: number,
  source: TaskWriteSource = 'api',
): Promise<void> {
  const tasks = listTasks();
  const index = tasks.findIndex(t => t.id === id);
  if (index < 0) throw new Error(`任务不存在: ${id}`);
  if (toIndex < 0 || toIndex >= tasks.length) {
    throw new Error(`目标索引无效: ${toIndex}`);
  }
  const next = [...tasks];
  const [item] = next.splice(index, 1);
  next.splice(toIndex, 0, item);
  const settings = loadSettings();
  await writeTasks(settings, next, source);
  await emitTasksChanged('replace', source);
}

export async function updateTaskExtractTags(
  id: string,
  tags: string[],
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const normalized = normalizeExtractInjectTags(tags);
  return updateTask(id, { extractInjectTags: normalized }, source);
}

export async function updateTaskExecutionOptions(
  id: string,
  patch: TaskExecutionOptionsPatch,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const task = getTask(id);
  if (!task) throw new Error(`任务不存在: ${id}`);
  const merged = mergeTaskExecutionOptions(task, patch);
  return updateTask(id, merged, source);
}

export async function updateTaskApiPreset(
  id: string,
  presetName: string,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const normalized = String(presetName ?? '').trim();
  if (normalized) {
    const settings = loadSettings();
    if (!findApiPreset(settings, normalized)) {
      console.warn(`[AI回复后处理] API 预设「${normalized}」不存在，仍将写入任务配置`);
    }
  }
  return updateTask(id, { apiPresetName: normalized }, source);
}

export async function addPromptGroup(
  id: string,
  group?: Partial<PromptGroup>,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const task = getTask(id);
  if (!task) throw new Error(`任务不存在: ${id}`);
  const groups = appendPromptGroup(task.promptGroups, group);
  return updateTask(id, { promptGroups: groups }, source);
}

export async function removePromptGroup(
  id: string,
  index: number,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const task = getTask(id);
  if (!task) throw new Error(`任务不存在: ${id}`);
  const groups = removePromptGroupAt(task.promptGroups, index);
  return updateTask(id, { promptGroups: groups }, source);
}

export async function movePromptGroup(
  id: string,
  index: number,
  delta: -1 | 1,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const task = getTask(id);
  if (!task) throw new Error(`任务不存在: ${id}`);
  const groups = movePromptGroupAt(task.promptGroups, index, delta);
  return updateTask(id, { promptGroups: groups }, source);
}

export async function setTaskEnabled(
  id: string,
  enabled: boolean,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  return updateTask(id, { enabled: !!enabled }, source);
}

export async function renameTask(
  id: string,
  name: string,
  source: TaskWriteSource = 'api',
): Promise<PostProcessTask> {
  const normalized = String(name ?? '').trim();
  if (!normalized) {
    throw new Error('任务名称不能为空');
  }
  return updateTask(id, { name: normalized }, source);
}

export function getLastRunStatus(): ScriptSettings['lastRunStatus'] {
  return _.cloneDeep(loadSettings().lastRunStatus);
}

export function listApiPresetNames(): string[] {
  return loadSettings().apiPresets.map(p => p.name);
}

export function resolveTaskApiPresetName(taskId: string): string {
  const settings = loadSettings();
  const effective = resolveEffectiveSettings(settings);
  const task = effective.tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`任务不存在: ${taskId}`);
  return resolveTaskApiPreset(settings, taskId, task.apiPresetName);
}

export async function resetTaskScheduleState(
  taskId?: string,
  source: TaskWriteSource = 'api',
): Promise<void> {
  const settings = loadSettings();
  if (taskId !== undefined) {
    const trimmed = taskId.trim();
    if (!trimmed) throw new Error('任务 ID 不能为空');
    delete settings.scheduleState[trimmed];
  } else {
    settings.scheduleState = {};
  }
  saveSettings(settings);
  await emitTasksChanged('schedule_reset', source, taskId?.trim());
}
