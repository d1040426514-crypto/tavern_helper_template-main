import {
  buildCompositeKey,
  buildExtractSpecKey,
  getPlotPlaceholderTagNames,
  sortAttrValues,
  type RelayTagMap,
} from './utils';
import {
  parseDynamicAttrPlaceholder,
  parseExtractTagSpec,
} from './tag-extract';
import { collectEnumRegistryAttrValues } from './replica-enum-parse';
import { newTaskId } from './task-clone';
import { iterTaskPromptContents } from './prompt-auto-segments';
import { PostProcessTaskSchema, type PostProcessTask, type ReplicaFamilyScheduleMode } from './schema';
import type { TaskProgressItem, TaskProgressStatus } from '../ui/task-progress-display';

const REPLICA_NAME_SUFFIX_RE = / \{.+\}$/;

export function stripReplicaNameSuffix(name: string, baseNameHint?: string): string {
  if (baseNameHint?.trim()) return baseNameHint.trim();
  return String(name ?? '').replace(REPLICA_NAME_SUFFIX_RE, '').trim() || '未命名任务';
}

export function getReplicaFamilyBaseNameFromTask(task: PostProcessTask): string {
  if (task.replicaFamilyBaseName?.trim()) return task.replicaFamilyBaseName.trim();
  return stripReplicaNameSuffix(task.name);
}

export function getReplicaFamilyScheduleMode(root: PostProcessTask): ReplicaFamilyScheduleMode {
  return root.replicaFamilyScheduleMode ?? 'auto';
}

export function isReplicaLaunched(task: PostProcessTask): boolean {
  return task.replicaFamilyLaunched === true;
}

export function shouldRunReplicaAtRuntime(replica: PostProcessTask, root: PostProcessTask): boolean {
  if (!replica.enabled) return false;
  const mode = getReplicaFamilyScheduleMode(root);
  if (mode === 'auto') return true;
  return isReplicaLaunched(replica);
}

export function scanDynamicAttrPlaceholders(task: PostProcessTask): string[] {
  const specs = new Set<string>();
  for (const content of iterTaskPromptContents(task)) {
    for (const name of getPlotPlaceholderTagNames(content)) {
      const dyn = parseDynamicAttrPlaceholder(name);
      if (dyn) specs.add(buildExtractSpecKey(dyn.tagName, dyn.attrName));
    }
  }
  return [...specs];
}

export function validateReplicaFamilyEligibility(task: PostProcessTask): { ok: true; spec: string } | { ok: false; error: string } {
  const specs = scanDynamicAttrPlaceholders(task);
  if (!specs.length) {
    return {
      ok: false,
      error: '启用「同步为副本族」要求提示词中含且仅含一种动态属性占位符（如 {{item@id}}，无 = 值）。',
    };
  }
  if (specs.length > 1) {
    return {
      ok: false,
      error: `提示词中含多种动态属性占位符（${specs.join('、')}），副本族仅支持一种。`,
    };
  }
  return { ok: true, spec: specs[0]! };
}

export function substituteDynamicPlaceholder(text: string, spec: string, attrValue: string): string {
  const parsed = parseExtractTagSpec(spec);
  if (!parsed?.attrName) return text;
  const dynamicToken = `{{${parsed.tagName}@${parsed.attrName}}}`;
  const preciseToken = `{{${buildCompositeKey(parsed.tagName, parsed.attrName, attrValue)}}}`;
  return String(text ?? '').split(dynamicToken).join(preciseToken);
}

function cloneAutoSegmentsFromRoot(
  root: PostProcessTask,
  spec: string,
  attrValue: string,
): PostProcessTask['promptAutoSegments'] {
  return (root.promptAutoSegments ?? []).map(s => ({
    ...s,
    content: substituteDynamicPlaceholder(s.content, spec, attrValue),
  }));
}

function clonePromptGroupsFromRoot(root: PostProcessTask, spec: string, attrValue: string): PostProcessTask['promptGroups'] {
  return (root.promptGroups ?? []).map(g => ({
    ...g,
    content: substituteDynamicPlaceholder(g.content, spec, attrValue),
  }));
}

function refreshReplicaPromptsFromRoot(replica: PostProcessTask, root: PostProcessTask, spec: string): PostProcessTask {
  const attrValue = replica.replicaFamilyAttrValue ?? '';
  if (!attrValue) return replica;
  return {
    ...replica,
    promptGroups: clonePromptGroupsFromRoot(root, spec, attrValue),
    promptAutoSegments: cloneAutoSegmentsFromRoot(root, spec, attrValue),
    name: `${getReplicaFamilyBaseNameFromTask(root)} ${attrValue}`,
  };
}

export function buildReplicaFromRoot(
  root: PostProcessTask,
  attrValue: string,
  baseName: string,
  allTasks: PostProcessTask[],
  schedule?: { launched?: boolean },
): PostProcessTask {
  const spec = root.replicaFamilySpec ?? scanDynamicAttrPlaceholders(root)[0] ?? '';
  const isManual = getReplicaFamilyScheduleMode(root) === 'manual';
  const defaultLaunched = isManual;
  const cloned = PostProcessTaskSchema.parse({
    ...structuredClone(root),
    id: newTaskId(),
    name: `${baseName} ${attrValue}`,
    enabled: true,
    replicaFamilyRootId: root.id,
    replicaFamilyAttrValue: attrValue,
    replicaFamilySpec: spec,
    syncAsReplicaFamily: false,
    replicaFamilyScheduleMode: undefined,
    replicaFamilyLaunched: schedule?.launched ?? defaultLaunched,
    taskWorkflowPresets: [],
    promptGroups: clonePromptGroupsFromRoot(root, spec, attrValue),
    promptAutoSegments: cloneAutoSegmentsFromRoot(root, spec, attrValue),
  });

  const existingIds = new Set(allTasks.map(t => t.id));
  if (existingIds.has(cloned.id)) {
    cloned.id = newTaskId();
  }
  return cloned;
}

export function getReplicaTasks(rootId: string, allTasks: PostProcessTask[]): PostProcessTask[] {
  return allTasks.filter(t => t.replicaFamilyRootId === rootId);
}

export function deleteReplicaFamilyTasks(rootId: string, allTasks: PostProcessTask[]): PostProcessTask[] {
  return allTasks.filter(t => t.replicaFamilyRootId !== rootId);
}

export type MergeReplicaFamilyResult = {
  tasks: PostProcessTask[];
  newlyCreatedIds: string[];
};

/** 增量同步：保留全部现有副本，仅新增 relay 中缺失的 attr 对应副本 */
export function mergeReplicaFamilyFromRelay(
  root: PostProcessTask,
  relayAttrValues: string[],
  allTasks: PostProcessTask[],
): MergeReplicaFamilyResult {
  const baseName = getReplicaFamilyBaseNameFromTask(root);
  const spec = root.replicaFamilySpec ?? scanDynamicAttrPlaceholders(root)[0] ?? '';
  const relaySet = new Set(relayAttrValues);
  const newlyCreatedIds: string[] = [];

  const withoutReplicas = allTasks.filter(t => t.replicaFamilyRootId !== root.id);
  const rootIdx = withoutReplicas.findIndex(t => t.id === root.id);
  if (rootIdx === -1) return { tasks: allTasks, newlyCreatedIds };

  const existingReplicas = getReplicaTasks(root.id, allTasks);
  const byAttr = new Map(existingReplicas.map(r => [r.replicaFamilyAttrValue ?? '', r]));

  const updatedRoot: PostProcessTask = {
    ...withoutReplicas[rootIdx]!,
    syncAsReplicaFamily: true,
    enabled: root.enabled,
    replicaFamilySpec: spec,
    replicaFamilyBaseName: baseName,
    name: baseName,
    replicaFamilyScheduleMode: root.replicaFamilyScheduleMode ?? 'auto',
  };

  const nextReplicas: PostProcessTask[] = [];

  for (const attrValue of sortAttrValues([...relaySet])) {
    const existing = byAttr.get(attrValue);
    if (existing) {
      nextReplicas.push(refreshReplicaPromptsFromRoot(existing, updatedRoot, spec));
      byAttr.delete(attrValue);
    } else {
      const created = buildReplicaFromRoot(updatedRoot, attrValue, baseName, allTasks);
      newlyCreatedIds.push(created.id);
      nextReplicas.push(created);
    }
  }

  for (const orphan of byAttr.values()) {
    nextReplicas.push(orphan);
  }

  nextReplicas.sort((a, b) =>
    (a.replicaFamilyAttrValue ?? '').localeCompare(b.replicaFamilyAttrValue ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

  const tasks = [...withoutReplicas];
  tasks[rootIdx] = updatedRoot;
  tasks.splice(rootIdx + 1, 0, ...nextReplicas);
  return { tasks, newlyCreatedIds };
}

/** @deprecated 请使用 mergeReplicaFamilyFromRelay */
export function syncReplicaFamily(
  root: PostProcessTask,
  attrValues: string[],
  allTasks: PostProcessTask[],
): PostProcessTask[] {
  return mergeReplicaFamilyFromRelay(root, attrValues, allTasks).tasks;
}

export function isReplicaFamilyRootTemplate(task: PostProcessTask): boolean {
  return !!task.syncAsReplicaFamily && !task.replicaFamilyRootId;
}

export function expandEnabledTasksForRuntime(tasks: PostProcessTask[]): PostProcessTask[] {
  return tasks.filter(t => {
    if (!t.enabled) return false;
    if (isReplicaFamilyRootTemplate(t)) return false;
    return true;
  });
}

export function getReplicaFamilyGroupId(task: PostProcessTask): string | null {
  if (task.replicaFamilyRootId) return task.replicaFamilyRootId;
  if (task.syncAsReplicaFamily) return task.id;
  return null;
}

export function getReplicaFamilyBaseName(task: PostProcessTask, allTasks: PostProcessTask[]): string {
  const rootId = task.replicaFamilyRootId ?? (task.syncAsReplicaFamily ? task.id : null);
  if (!rootId) return task.name;
  const root = allTasks.find(t => t.id === rootId);
  return getReplicaFamilyBaseNameFromTask(root ?? task);
}

export function getReplicaDisplaySuffix(task: PostProcessTask): string | null {
  if (task.replicaFamilyAttrValue) return task.replicaFamilyAttrValue;
  return null;
}

export const REPLICA_PROGRESS_GROUP_PREFIX = 'replica-group:';

export function getReplicaProgressGroupId(task: PostProcessTask): string | null {
  if (!task.replicaFamilyRootId) return null;
  return `${REPLICA_PROGRESS_GROUP_PREFIX}${task.replicaFamilyRootId}`;
}

export type ReplicaMemberProgressState = {
  status: TaskProgressStatus;
  detail?: string;
};

export function buildReplicaAggregatedStatus(memberStatuses: TaskProgressStatus[]): TaskProgressStatus {
  if (!memberStatuses.length) return 'pending';
  if (memberStatuses.some(s => s === 'running')) return 'running';
  if (memberStatuses.some(s => s === 'failed')) return 'failed';
  if (memberStatuses.every(s => s === 'skipped')) return 'skipped';
  if (memberStatuses.every(s => s === 'done' || s === 'skipped')) return 'done';
  return 'pending';
}

export function buildReplicaGroupDetail(memberStatuses: TaskProgressStatus[]): string | undefined {
  if (memberStatuses.length <= 1) return undefined;
  const finished = memberStatuses.filter(s => s === 'done' || s === 'skipped').length;
  if (finished >= memberStatuses.length) return undefined;
  return `${finished}/${memberStatuses.length}`;
}

export function buildStageProgressDisplayItems(
  stageTasks: PostProcessTask[],
  allTasks: PostProcessTask[],
  memberStates: Map<string, ReplicaMemberProgressState> = new Map(),
): TaskProgressItem[] {
  const seenGroups = new Set<string>();
  const items: TaskProgressItem[] = [];

  for (const task of stageTasks) {
    const groupId = getReplicaProgressGroupId(task);
    if (groupId) {
      if (seenGroups.has(groupId)) continue;
      seenGroups.add(groupId);
      const members = stageTasks.filter(t => getReplicaProgressGroupId(t) === groupId);
      const memberStatuses = members.map(m => memberStates.get(m.id)?.status ?? 'pending');
      const status = buildReplicaAggregatedStatus(memberStatuses);
      let detail = buildReplicaGroupDetail(memberStatuses);
      if (status === 'failed') {
        const failed = members.find(m => memberStates.get(m.id)?.status === 'failed');
        detail = failed ? memberStates.get(failed.id)?.detail : detail;
      } else if (status === 'skipped') {
        const skipped = members.find(m => memberStates.get(m.id)?.status === 'skipped');
        detail = skipped ? memberStates.get(skipped.id)?.detail : detail;
      }
      items.push({
        taskId: groupId,
        taskName: getReplicaFamilyBaseName(task, allTasks),
        status,
        detail,
      });
      continue;
    }

    const state = memberStates.get(task.id);
    items.push({
      taskId: task.id,
      taskName: task.name,
      status: state?.status ?? 'pending',
      detail: state?.detail,
    });
  }

  return items;
}

export function getReplicaAttrSpecForTask(
  task: PostProcessTask,
): { tagName: string; attrName: string } | undefined {
  if (!task.replicaFamilyRootId || !task.replicaFamilySpec) return undefined;
  const parsed = parseExtractTagSpec(task.replicaFamilySpec);
  if (!parsed?.attrName) return undefined;
  return { tagName: parsed.tagName, attrName: parsed.attrName };
}

export function collectAttrValuesForReplicaRoot(
  root: PostProcessTask,
  relayMap: RelayTagMap,
): string[] {
  const enumSpecStr =
    root.replicaFamilyEnumSpec?.trim() ||
    root.replicaFamilySpec ||
    scanDynamicAttrPlaceholders(root)[0];
  if (!enumSpecStr) return [];
  const parsed = parseExtractTagSpec(enumSpecStr);
  if (!parsed?.attrName) return [];
  return collectEnumRegistryAttrValues(relayMap, parsed);
}

export function listReplicaFamilyScheduleEntries(
  rootId: string,
  allTasks: PostProcessTask[],
): Array<{
  id: string;
  name: string;
  attrValue: string;
  launched: boolean;
}> {
  return getReplicaTasks(rootId, allTasks).map(r => ({
    id: r.id,
    name: r.name,
    attrValue: r.replicaFamilyAttrValue ?? '',
    launched: isReplicaLaunched(r),
  }));
}

export type PrepareStageReplicaSyncResult = {
  tasks: PostProcessTask[];
  allTasks: PostProcessTask[];
  skippedRoots: PostProcessTask[];
  newlyCreatedReplicaIds: string[];
};

export function prepareStageTasksWithReplicaSync(
  stageTasks: PostProcessTask[],
  allTasks: PostProcessTask[],
  relayMap: RelayTagMap,
): PrepareStageReplicaSyncResult {
  let updatedAll = [...allTasks];
  const skippedRoots: PostProcessTask[] = [];
  const runtimeTasks: PostProcessTask[] = [];
  const handledRoots = new Set<string>();
  const newlyCreatedReplicaIds: string[] = [];

  for (const task of stageTasks) {
    if (task.replicaFamilyRootId) continue;

    if (isReplicaFamilyRootTemplate(task)) {
      if (handledRoots.has(task.id)) continue;
      handledRoots.add(task.id);
      const root = updatedAll.find(t => t.id === task.id) ?? task;
      const attrValues = collectAttrValuesForReplicaRoot(root, relayMap);
      const merged = mergeReplicaFamilyFromRelay(root, attrValues, updatedAll);
      updatedAll = merged.tasks;
      newlyCreatedReplicaIds.push(...merged.newlyCreatedIds);
      const syncedRoot = updatedAll.find(t => t.id === root.id) ?? root;
      const replicas = getReplicaTasks(syncedRoot.id, updatedAll);
      const relaySet = new Set(attrValues);
      const mode = getReplicaFamilyScheduleMode(syncedRoot);

      const runnable = replicas.filter(r => {
        if (!shouldRunReplicaAtRuntime(r, syncedRoot)) return false;
        if (mode === 'auto') {
          return relaySet.has(r.replicaFamilyAttrValue ?? '');
        }
        return true;
      });

      if (!runnable.length) {
        skippedRoots.push(syncedRoot);
        continue;
      }
      runtimeTasks.push(...runnable);
      continue;
    }

    runtimeTasks.push(task);
  }

  return {
    tasks: runtimeTasks,
    allTasks: updatedAll,
    skippedRoots,
    newlyCreatedReplicaIds,
  };
}

export function resetNewlyCreatedReplicaLaunched(
  allTasks: PostProcessTask[],
  newlyCreatedIds: string[],
): PostProcessTask[] {
  if (!newlyCreatedIds.length) return allTasks;
  const idSet = new Set(newlyCreatedIds);
  return allTasks.map(t => (idSet.has(t.id) ? { ...t, replicaFamilyLaunched: false } : t));
}

export function enableReplicaFamilyOnTask(task: PostProcessTask): PostProcessTask {
  const validation = validateReplicaFamilyEligibility(task);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const baseName = getReplicaFamilyBaseNameFromTask(task);
  return {
    ...task,
    enabled: true,
    syncAsReplicaFamily: true,
    replicaFamilySpec: validation.spec,
    replicaFamilyEnumSpec: validation.spec,
    replicaFamilyBaseName: baseName,
    replicaFamilyScheduleMode: task.replicaFamilyScheduleMode ?? 'auto',
    name: baseName,
  };
}

export function disableReplicaFamilyOnTasks(task: PostProcessTask, allTasks: PostProcessTask[]): PostProcessTask[] {
  const rootId = task.replicaFamilyRootId ?? (task.syncAsReplicaFamily ? task.id : null);
  if (!rootId) {
    return allTasks.map(t => (t.id === task.id ? { ...t, enabled: false, syncAsReplicaFamily: false } : t));
  }

  let tasks = deleteReplicaFamilyTasks(rootId, allTasks);
  tasks = tasks.map(t => {
    if (t.id !== rootId) return t;
    return {
      ...t,
      enabled: false,
      syncAsReplicaFamily: false,
      replicaFamilySpec: undefined,
      replicaFamilyEnumSpec: undefined,
      replicaFamilyBaseName: undefined,
      replicaFamilyScheduleMode: undefined,
    };
  });
  return tasks;
}

export function clearReplicaFamilyFieldsOnClone(task: PostProcessTask): PostProcessTask {
  return {
    ...task,
    syncAsReplicaFamily: false,
    replicaFamilyRootId: undefined,
    replicaFamilyAttrValue: undefined,
    replicaFamilySpec: undefined,
    replicaFamilyEnumSpec: undefined,
    replicaFamilyBaseName: undefined,
    replicaFamilyScheduleMode: undefined,
    replicaFamilyLaunched: undefined,
  };
}

export function hasReplicaFamilyTasks(tasks: PostProcessTask[]): boolean {
  return tasks.some(t => t.syncAsReplicaFamily);
}
