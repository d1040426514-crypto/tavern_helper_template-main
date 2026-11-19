import type { ReplicaFamilyCleanupDialogOutcome } from '../ui/mount-cleanup-dialog';
import { persistRuntimeTaskChanges, syncCleanupUserConfigFromDisk } from './persist-runtime-tasks';
import { pruneWorldbookForRemovedReplicas } from './prune-applied-for-replica';
import {
  applyReplicaFamilyCleanup,
  computeAutoKeepSet,
  hasReplicaFamilyTasks,
  resetReplicaFamilyCleanupCycle,
  shouldTriggerCleanup,
  tickCleanupRound,
  type RemovedReplicaCleanupInfo,
  type ReplicaCleanupSnapshotEffect,
} from './replica-family-cleanup';
import type { ScriptSettings } from './schema';

/** 等一次重绘再弹窗；后台标签页 rAF 不触发，所以带超时兜底，避免该楼处理流程一直挂住 */
export function waitForNextPaint(timeoutMs = 1500): Promise<void> {
  return new Promise<void>(resolve => {
    let settled = false;
    const timer = setTimeout(() => finish(), timeoutMs);
    function finish(): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    }
    if (typeof requestAnimationFrame !== 'function') {
      finish();
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  });
}

function emptyCleanupSnapshotEffect(): ReplicaCleanupSnapshotEffect {
  return { authoritativeRootIds: [], removedAttrByRoot: {}, clearedSpecs: [] };
}

/** 外部依赖：弹窗和等重绘由调用方注入，便于在无 UI 环境下测试 */
export type ReplicaCleanupRunDeps = {
  showDialog: (
    settings: ScriptSettings,
    newlyCreatedReplicaIds: string[],
  ) => Promise<ReplicaFamilyCleanupDialogOutcome>;
  waitForPaint?: () => Promise<void>;
};

export async function runReplicaFamilyCleanupIfDue(
  deps: ReplicaCleanupRunDeps,
  baseSettings: ScriptSettings,
  effectiveSettings: ScriptSettings,
  messageId: number,
  newlyCreatedReplicaIds: string[] = [],
  options?: { advanceCycle?: boolean },
): Promise<ReplicaCleanupSnapshotEffect | undefined> {
  // 工作流可能跑了很久，期间用户可能关掉了清理开关：以磁盘最新配置为准，不用开跑时的旧快照
  syncCleanupUserConfigFromDisk(effectiveSettings);
  if (!effectiveSettings.replicaFamilyCleanup.enabled) {
    // 关闭时不累计周期；清零后重新开启会从头计数
    resetReplicaFamilyCleanupCycle(effectiveSettings);
    await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
    return undefined;
  }

  const advanceCycle = options?.advanceCycle !== false && hasReplicaFamilyTasks(effectiveSettings.tasks);
  if (advanceCycle) tickCleanupRound(effectiveSettings);
  if (!advanceCycle || !shouldTriggerCleanup(effectiveSettings)) {
    // 未到周期也要落盘，否则下一轮 loadSettings 会丢弃 tick（N>1 永远到不了阈值）
    await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
    return undefined;
  }

  const cleanup = effectiveSettings.replicaFamilyCleanup;
  if (cleanup.mode === 'auto') {
    const keepSet = computeAutoKeepSet(effectiveSettings, newlyCreatedReplicaIds);
    const removedOut: RemovedReplicaCleanupInfo[] = [];
    const snapshotEffect = emptyCleanupSnapshotEffect();
    const next = applyReplicaFamilyCleanup(effectiveSettings, keepSet, messageId, {
      removedOut,
      snapshotEffect,
    });
    Object.assign(effectiveSettings, next);
    await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
    await pruneWorldbookForRemovedReplicas(removedOut, effectiveSettings.chatWorldbookWriteRules ?? [], {
      clearedSpecs: snapshotEffect.clearedSpecs,
    });
    return snapshotEffect;
  }

  await (deps.waitForPaint ?? waitForNextPaint)();

  // 等待重绘期间用户也可能关了开关：弹窗前再确认一次
  syncCleanupUserConfigFromDisk(effectiveSettings);
  if (!effectiveSettings.replicaFamilyCleanup.enabled) {
    resetReplicaFamilyCleanupCycle(effectiveSettings);
    await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
    return undefined;
  }

  const outcome = await deps.showDialog(effectiveSettings, newlyCreatedReplicaIds);
  if (outcome.status === 'busy' || outcome.status === 'empty') {
    // 已有弹窗 / 无候选：不算用户跳过，不重置周期，只落盘当前计数
    await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
    return undefined;
  }

  // 弹窗期间用户去设置里关掉了开关：丢弃本次结果，不清理
  syncCleanupUserConfigFromDisk(effectiveSettings);
  if (!effectiveSettings.replicaFamilyCleanup.enabled) {
    resetReplicaFamilyCleanupCycle(effectiveSettings);
    await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
    return undefined;
  }

  if (outcome.status === 'skipped') {
    // 用户主动跳过：本周期结束，重置计数，下个 N 轮再询问
    resetReplicaFamilyCleanupCycle(effectiveSettings);
    await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
    return undefined;
  }

  const result = outcome;
  const removedOut: RemovedReplicaCleanupInfo[] = [];
  const snapshotEffect = emptyCleanupSnapshotEffect();
  const next = applyReplicaFamilyCleanup(effectiveSettings, result.keepBySpec, messageId, {
    ...(result.persistManualKeep ? { persistManualKeepBySpec: result.keepBySpec } : {}),
    removedOut,
    snapshotEffect,
  });
  Object.assign(effectiveSettings, next);
  await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
  await pruneWorldbookForRemovedReplicas(removedOut, effectiveSettings.chatWorldbookWriteRules ?? [], {
    clearedSpecs: snapshotEffect.clearedSpecs,
  });
  return snapshotEffect;
}
