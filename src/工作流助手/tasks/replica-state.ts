import {
  getReplicaFamilyScheduleMode,
  getReplicaTasks,
  isReplicaFamilyRootTemplate,
  mergeReplicaFamilyFromRelay,
} from './replica-family';
import type { PostProcessTask } from './schema';

export const POST_PROCESS_REPLICA_STATE_KEY = '_post_process_replica_state';

export type ReplicaRootState = {
  attrValues: string[];
  launchedAttrValues?: string[];
};

export type ReplicaStateSnapshot = Record<string, ReplicaRootState>;

function isValidReplicaRootState(value: unknown): value is ReplicaRootState {
  if (!value || typeof value !== 'object') return false;
  return Array.isArray((value as ReplicaRootState).attrValues);
}

/** 将 message.data 中的原始对象解析为规范化快照（丢弃非法项） */
export function normalizeReplicaStateSnapshot(raw: unknown): ReplicaStateSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const snapshot: ReplicaStateSnapshot = {};
  for (const [rootId, state] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidReplicaRootState(state)) {
      snapshot[rootId] = {
        attrValues: [...state.attrValues],
        launchedAttrValues: Array.isArray(state.launchedAttrValues)
          ? [...state.launchedAttrValues]
          : undefined,
      };
    }
  }
  return snapshot;
}

/** 从当前 tasks 构建本楼副本状态快照（每个 root 的 attrValue 列表 + launched 列表） */
export function buildReplicaStateFromTasks(tasks: PostProcessTask[]): ReplicaStateSnapshot {
  const snapshot: ReplicaStateSnapshot = {};
  for (const root of tasks) {
    if (!isReplicaFamilyRootTemplate(root)) continue;
    const members = getReplicaTasks(root.id, tasks);
    const attrValues: string[] = [];
    const launchedAttrValues: string[] = [];
    for (const member of members) {
      const attr = member.replicaFamilyAttrValue ?? '';
      if (!attr) continue;
      attrValues.push(attr);
      if (member.replicaFamilyLaunched === true) launchedAttrValues.push(attr);
    }
    snapshot[root.id] = {
      attrValues,
      ...(launchedAttrValues.length ? { launchedAttrValues } : {}),
    };
  }
  return snapshot;
}

/** 合并多楼快照：后者整包覆盖前者（同 worldbook ledger 语义） */
export function mergeReplicaStateSnapshots(snapshots: ReplicaStateSnapshot[]): ReplicaStateSnapshot {
  const merged: ReplicaStateSnapshot = {};
  for (const snapshot of snapshots) {
    for (const [rootId, state] of Object.entries(snapshot)) {
      merged[rootId] = {
        attrValues: [...state.attrValues],
        launchedAttrValues: state.launchedAttrValues ? [...state.launchedAttrValues] : undefined,
      };
    }
  }
  return merged;
}

/** 依据快照期望的 attrValue 列表，将 tasks 中副本成员重放为一致状态 */
export function applyReplicaStateToTasks(
  tasks: PostProcessTask[],
  snapshot: ReplicaStateSnapshot,
): PostProcessTask[] {
  let next = [...tasks];
  for (const root of tasks) {
    if (!isReplicaFamilyRootTemplate(root)) continue;
    const state = snapshot[root.id];
    const desired = state?.attrValues ?? [];
    const launchedSet = new Set(state?.launchedAttrValues ?? []);

    const currentRoot = next.find(t => t.id === root.id) ?? root;
    const keepSet = new Set(desired);
    next = next.filter(t => {
      if (t.replicaFamilyRootId !== root.id) return true;
      return keepSet.has(t.replicaFamilyAttrValue ?? '');
    });
    next = mergeReplicaFamilyFromRelay(currentRoot, desired, next).tasks;

    const isManual = getReplicaFamilyScheduleMode(currentRoot) === 'manual';
    if (isManual) {
      next = next.map(t => {
        if (t.replicaFamilyRootId !== root.id) return t;
        const attr = t.replicaFamilyAttrValue ?? '';
        return { ...t, replicaFamilyLaunched: launchedSet.has(attr) };
      });
    }
  }
  return next;
}
