import {
  buildCompositeKey,
  buildExtractSpecKey,
  collectAttrValuesFromRelay,
  getPlotPlaceholderTagNames,
  isPromptGroupEnabled,
  type RelayTagMap,
} from './utils';
import {
  parseDynamicAttrPlaceholder,
  parseExtractTagSpec,
} from './tag-extract';
import { newTaskId } from './task-clone';
import { PostProcessTaskSchema, type PostProcessTask } from './schema';

const REPLICA_NAME_SUFFIX_RE = / \{.+\}$/;

export function stripReplicaNameSuffix(name: string, baseNameHint?: string): string {
  if (baseNameHint?.trim()) return baseNameHint.trim();
  return String(name ?? '').replace(REPLICA_NAME_SUFFIX_RE, '').trim() || '未命名任务';
}

export function getReplicaFamilyBaseNameFromTask(task: PostProcessTask): string {
  if (task.replicaFamilyBaseName?.trim()) return task.replicaFamilyBaseName.trim();
  return stripReplicaNameSuffix(task.name);
}

export function scanDynamicAttrPlaceholders(task: PostProcessTask): string[] {
  const specs = new Set<string>();
  for (const group of task.promptGroups ?? []) {
    if (!isPromptGroupEnabled(group)) continue;
    for (const name of getPlotPlaceholderTagNames(group.content)) {
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

function clonePromptGroupsFromRoot(root: PostProcessTask, spec: string, attrValue: string): PostProcessTask['promptGroups'] {
  return (root.promptGroups ?? []).map(g => ({
    ...g,
    content: substituteDynamicPlaceholder(g.content, spec, attrValue),
  }));
}

export function buildReplicaFromRoot(
  root: PostProcessTask,
  attrValue: string,
  baseName: string,
  allTasks: PostProcessTask[],
): PostProcessTask {
  const spec = root.replicaFamilySpec ?? scanDynamicAttrPlaceholders(root)[0] ?? '';
  const cloned = PostProcessTaskSchema.parse({
    ...structuredClone(root),
    id: newTaskId(),
    name: `${baseName} ${attrValue}`,
    enabled: true,
    replicaFamilyRootId: root.id,
    replicaFamilyAttrValue: attrValue,
    replicaFamilySpec: spec,
    syncAsReplicaFamily: false,
    promptGroups: clonePromptGroupsFromRoot(root, spec, attrValue),
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

export function syncReplicaFamily(
  root: PostProcessTask,
  attrValues: string[],
  allTasks: PostProcessTask[],
): PostProcessTask[] {
  const baseName = getReplicaFamilyBaseNameFromTask(root);
  const spec = root.replicaFamilySpec ?? scanDynamicAttrPlaceholders(root)[0] ?? '';
  let tasks = deleteReplicaFamilyTasks(root.id, allTasks);

  const rootIdx = tasks.findIndex(t => t.id === root.id);
  if (rootIdx === -1) return allTasks;

  const updatedRoot: PostProcessTask = {
    ...tasks[rootIdx]!,
    syncAsReplicaFamily: true,
    enabled: root.enabled,
    replicaFamilySpec: spec,
    replicaFamilyBaseName: baseName,
    name: baseName,
  };
  tasks[rootIdx] = updatedRoot;

  const insertAt = rootIdx + 1;
  const replicas = attrValues.map(v => buildReplicaFromRoot(updatedRoot, v, baseName, tasks));
  tasks.splice(insertAt, 0, ...replicas);
  return tasks;
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

export function collectAttrValuesForReplicaRoot(
  root: PostProcessTask,
  relayMap: RelayTagMap,
): string[] {
  const specStr = root.replicaFamilySpec ?? scanDynamicAttrPlaceholders(root)[0];
  if (!specStr) return [];
  const parsed = parseExtractTagSpec(specStr);
  if (!parsed?.attrName) return [];
  return collectAttrValuesFromRelay(relayMap, parsed);
}

export function prepareStageTasksWithReplicaSync(
  stageTasks: PostProcessTask[],
  allTasks: PostProcessTask[],
  relayMap: RelayTagMap,
): { tasks: PostProcessTask[]; allTasks: PostProcessTask[]; skippedRoots: PostProcessTask[] } {
  let updatedAll = [...allTasks];
  const skippedRoots: PostProcessTask[] = [];
  const runtimeTasks: PostProcessTask[] = [];
  const handledRoots = new Set<string>();

  for (const task of stageTasks) {
    if (task.replicaFamilyRootId) continue;

    if (isReplicaFamilyRootTemplate(task)) {
      if (handledRoots.has(task.id)) continue;
      handledRoots.add(task.id);
      const root = updatedAll.find(t => t.id === task.id) ?? task;
      const attrValues = collectAttrValuesForReplicaRoot(root, relayMap);
      if (!attrValues.length) {
        skippedRoots.push(root);
        continue;
      }
      updatedAll = syncReplicaFamily(root, attrValues, updatedAll);
      const replicas = getReplicaTasks(root.id, updatedAll).filter(r => r.enabled);
      runtimeTasks.push(...replicas);
      continue;
    }

    runtimeTasks.push(task);
  }

  return { tasks: runtimeTasks, allTasks: updatedAll, skippedRoots };
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
    replicaFamilyBaseName: baseName,
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
      replicaFamilyBaseName: undefined,
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
    replicaFamilyBaseName: undefined,
  };
}
