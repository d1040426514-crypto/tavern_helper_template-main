import {
  TaskWorkflowPresetSnapshotSchema,
  type PostProcessTask,
  type TaskWorkflowPresetEntry,
  type TaskWorkflowPresetSnapshot,
} from './schema';

const API_FIELDS = [
  'apiPresetName',
  'apiPresetFallbackNames',
  'apiPrimaryMaxConcurrency',
  'apiFallbackMaxConcurrencies',
] as const;

const IDENTITY_FIELDS = [
  'id',
  'replicaFamilyRootId',
  'replicaFamilyAttrValue',
  'syncAsReplicaFamily',
] as const;

const REPLICA_SCHEDULE_FIELDS = [
  'replicaFamilyScheduleMode',
  'replicaFamilySelected',
  'replicaFamilyLaunched',
] as const;

export function buildTaskWorkflowSnapshot(task: PostProcessTask): TaskWorkflowPresetSnapshot {
  const raw = structuredClone(task) as Record<string, unknown>;
  for (const key of [...API_FIELDS, ...IDENTITY_FIELDS, ...REPLICA_SCHEDULE_FIELDS, 'taskWorkflowPresets']) {
    delete raw[key];
  }
  return TaskWorkflowPresetSnapshotSchema.parse(raw);
}

export function applyTaskWorkflowSnapshot(task: PostProcessTask, snapshot: TaskWorkflowPresetSnapshot): PostProcessTask {
  const parsed = TaskWorkflowPresetSnapshotSchema.parse(snapshot);
  const apiPreserve = {
    apiPresetName: task.apiPresetName,
    apiPresetFallbackNames: task.apiPresetFallbackNames,
    apiPrimaryMaxConcurrency: task.apiPrimaryMaxConcurrency,
    apiFallbackMaxConcurrencies: task.apiFallbackMaxConcurrencies,
  };
  const schedulePreserve = {
    replicaFamilyScheduleMode: task.replicaFamilyScheduleMode,
    replicaFamilySelected: task.replicaFamilySelected,
    replicaFamilyLaunched: task.replicaFamilyLaunched,
  };
  return {
    ...task,
    ...parsed,
    id: task.id,
    syncAsReplicaFamily: task.syncAsReplicaFamily,
    replicaFamilyRootId: task.replicaFamilyRootId,
    replicaFamilyAttrValue: task.replicaFamilyAttrValue,
    taskWorkflowPresets: task.taskWorkflowPresets ?? [],
    ...apiPreserve,
    ...schedulePreserve,
  };
}

export function listTaskWorkflowPresetNames(task: PostProcessTask): string[] {
  return (task.taskWorkflowPresets ?? []).map(p => p.name);
}

export function saveTaskWorkflowPresetOnTask(task: PostProcessTask, name: string): PostProcessTask {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('工作流预设名称不能为空');
  const snapshot = buildTaskWorkflowSnapshot(task);
  const entry: TaskWorkflowPresetEntry = {
    name: trimmed,
    savedAt: Date.now(),
    snapshot,
  };
  const presets = [...(task.taskWorkflowPresets ?? [])];
  const idx = presets.findIndex(p => p.name === trimmed);
  if (idx >= 0) presets[idx] = entry;
  else presets.push(entry);
  return { ...task, taskWorkflowPresets: presets };
}

export function applyTaskWorkflowPresetOnTask(task: PostProcessTask, name: string): PostProcessTask {
  const trimmed = String(name ?? '').trim();
  const entry = (task.taskWorkflowPresets ?? []).find(p => p.name === trimmed);
  if (!entry) throw new Error(`工作流预设不存在: ${trimmed}`);
  return applyTaskWorkflowSnapshot(task, entry.snapshot);
}

export function deleteTaskWorkflowPresetOnTask(task: PostProcessTask, name: string): PostProcessTask {
  const trimmed = String(name ?? '').trim();
  const presets = (task.taskWorkflowPresets ?? []).filter(p => p.name !== trimmed);
  if (presets.length === (task.taskWorkflowPresets ?? []).length) {
    throw new Error(`工作流预设不存在: ${trimmed}`);
  }
  return { ...task, taskWorkflowPresets: presets };
}
