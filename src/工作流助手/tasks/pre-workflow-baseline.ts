import {
  POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY,
  retainRemovedLedgerEntries,
  type WorldbookWriteAppliedEntry,
} from '../worldbook/write-sync';
import {
  normalizeReplicaStateSnapshot,
  POST_PROCESS_REPLICA_STATE_KEY,
  retainExplicitReplicaSnapshot,
} from './replica-state';
import { rememberReplicaSnapshotFloor } from './replica-snapshot-floors';

export const PRE_WORKFLOW_BASELINE_KEY = '_post_process_pre_workflow_baseline';

export type PreWorkflowBaseline = {
  post_process_tags: unknown;
  worldbookApplied: unknown;
  replicaSnapshot: unknown;
};

function readMessageData(messageId: number): Record<string, unknown> | null {
  const msg = getChatMessages(messageId)[0];
  if (!msg) return null;
  return { ...((msg.data ?? {}) as Record<string, unknown>) };
}

function readStoredBaseline(data: Record<string, unknown>): PreWorkflowBaseline | null {
  const raw = data[PRE_WORKFLOW_BASELINE_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as PreWorkflowBaseline;
}

/**
 * 刷新生文：本楼只留下清理墓碑和 explicit 副本名单。
 * 上一轮新增的普通账本、未标记的副本名单去掉，避免排除本楼重算时把已删名字写回来。
 */
export async function retainFloorCleanupMarkers(messageId: number): Promise<void> {
  const data = readMessageData(messageId);
  if (!data) return;

  const rawApplied = data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
  const tombstones = Array.isArray(rawApplied)
    ? retainRemovedLedgerEntries(rawApplied as WorldbookWriteAppliedEntry[])
    : [];
  if (tombstones.length) {
    data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY] = tombstones;
  } else {
    delete data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
  }

  const explicit = retainExplicitReplicaSnapshot(
    normalizeReplicaStateSnapshot(data[POST_PROCESS_REPLICA_STATE_KEY]) ?? {},
  );
  if (Object.keys(explicit).length) {
    data[POST_PROCESS_REPLICA_STATE_KEY] = explicit;
  } else {
    delete data[POST_PROCESS_REPLICA_STATE_KEY];
  }
  rememberReplicaSnapshotFloor(
    messageId,
    Object.keys(explicit).length ? explicit : null,
  );

  await setChatMessages([{ message_id: messageId, data }], { refresh: 'none' });
}

/** 继承之后、摘取和任务改写之前：记下本楼标签、世界书账本和副本快照。 */
export async function capturePreWorkflowBaseline(messageId: number): Promise<void> {
  const data = readMessageData(messageId);
  if (!data) return;

  let tags: unknown = null;
  try {
    const vars = getVariables({ type: 'message', message_id: messageId }) ?? {};
    const raw = (vars as Record<string, unknown>).post_process_tags;
    tags = raw == null ? null : _.cloneDeep(raw);
  } catch {
    tags = null;
  }

  const baseline: PreWorkflowBaseline = {
    post_process_tags: tags,
    worldbookApplied:
      data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY] == null
        ? null
        : _.cloneDeep(data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY]),
    replicaSnapshot:
      data[POST_PROCESS_REPLICA_STATE_KEY] == null
        ? null
        : _.cloneDeep(data[POST_PROCESS_REPLICA_STATE_KEY]),
  };

  await setChatMessages(
    [
      {
        message_id: messageId,
        data: { ...data, [PRE_WORKFLOW_BASELINE_KEY]: baseline },
      },
    ],
    { refresh: 'none' },
  );
}

export function readPreWorkflowBaseline(messageId: number): PreWorkflowBaseline | null {
  const data = readMessageData(messageId);
  if (!data) return null;
  const baseline = readStoredBaseline(data);
  return baseline ? _.cloneDeep(baseline) : null;
}

/** replaceMvuData 会整包换掉楼层变量。只把基线键写回去，不改当前标签和账本。 */
export function withPreWorkflowBaselineKey(
  data: Record<string, unknown>,
  baseline: PreWorkflowBaseline,
): Record<string, unknown> {
  return { ...data, [PRE_WORKFLOW_BASELINE_KEY]: _.cloneDeep(baseline) };
}

export async function keepPreWorkflowBaselineKey(
  messageId: number,
  baseline: PreWorkflowBaseline | null,
): Promise<void> {
  if (!baseline) return;
  const data = readMessageData(messageId);
  if (!data) return;
  await setChatMessages(
    [{ message_id: messageId, data: withPreWorkflowBaselineKey(data, baseline) }],
    { refresh: 'none' },
  );
}

/** 手动重跑：把本楼标签、账本和副本快照恢复成工作流开始前的那一份。 */
export async function restorePreWorkflowBaseline(
  messageId: number,
  held?: PreWorkflowBaseline | null,
): Promise<boolean> {
  const data = readMessageData(messageId);
  if (!data) return false;
  const baseline = held ?? readStoredBaseline(data);
  if (!baseline) return false;

  updateVariablesWith(
    variables => {
      if (baseline.post_process_tags == null) {
        delete variables.post_process_tags;
      } else {
        variables.post_process_tags = _.cloneDeep(baseline.post_process_tags);
      }
      return variables;
    },
    { type: 'message', message_id: messageId },
  );

  const next = readMessageData(messageId) ?? data;
  if (baseline.worldbookApplied == null) {
    delete next[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
  } else {
    next[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY] = _.cloneDeep(baseline.worldbookApplied);
  }
  if (baseline.replicaSnapshot == null) {
    delete next[POST_PROCESS_REPLICA_STATE_KEY];
  } else {
    next[POST_PROCESS_REPLICA_STATE_KEY] = _.cloneDeep(baseline.replicaSnapshot);
  }
  next[PRE_WORKFLOW_BASELINE_KEY] = _.cloneDeep(baseline);

  await setChatMessages([{ message_id: messageId, data: next }], { refresh: 'none' });
  return true;
}
