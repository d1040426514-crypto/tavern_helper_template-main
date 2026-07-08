import { captureDataSnapshot } from '../bridge/database-api';
import { loadSettings, saveSettings } from '../settings';
import { resolveEffectiveSettings } from './effective-settings';
import { injectToAiFloor } from './inject';
import { applyInjectVariableUpdates } from './inject-variable-update';
import {
  beginRun,
  endRun,
  requestCancelRun,
} from './run-control';
import {
  isPostProcessSilent,
  isProcessing,
  markProcessing,
  runPostProcessTasks,
  unmarkProcessing,
} from './runtime';
import { applyAssistantChatTagExtract } from './chat-tag-extract';
import { ensureBodyReplaceOriginCaptured, restoreBodyReplaceOrigin } from './chat-body-tag-replace';
import {
  applyTagVariableInjectTemplate,
  mergeAiFloorInjectBlock,
  restorePostProcessTagsFromPreviousFloor,
} from './tag-variables';
import {
  hideTaskProgressToast,
  isTaskProgressStopping,
  showTaskProgressToast,
  updateTaskProgressToast,
  type TaskProgressUpdate,
} from '../ui/task-progress-toast';
import { registerMvuDeferredTrigger, isMvuDeferActive } from './mvu-trigger-defer';
import {
  markChatGenerationAborted,
  markChatGenerationStarted,
  shouldSuppressAutoTriggerAfterAbort,
} from './trigger-guard';
import { acuToast } from '../ui/toast';
import { SCRIPT_LOG_PREFIX } from '../ui/brand';
import { persistRuntimeTaskChanges } from './persist-runtime-tasks';
import { resetNewlyCreatedReplicaLaunched } from './replica-family';
import {
  applyReplicaFamilyCleanup,
  computeAutoKeepSet,
  incrementReplicaRunCounts,
  shouldTriggerCleanup,
  tickCleanupRound,
} from './replica-family-cleanup';
import { showReplicaFamilyCleanupDialog } from '../ui/mount-cleanup-dialog';
import type { ScriptSettings } from './schema';
import {
  resolveManualRerunFloorId,
  resolveAutoTriggerMessageId,
} from './message-floor';

function persistRunStatus(
  settings: ReturnType<typeof loadSettings>,
  messageId: number,
  results: Awaited<ReturnType<typeof runPostProcessTasks>>['results'],
) {
  settings.lastRunStatus = {
    messageId,
    at: Date.now(),
    taskResults: results.map(r => ({
      taskId: r.taskId,
      taskName: r.taskName,
      stage: r.stage,
      skipped: r.skipped,
      skipReason: r.skipReason,
      success: r.success,
      preview: r.extractedBlock.slice(0, 200),
      extractedTags: _.cloneDeep(r.extractedTags),
      durationMs: r.durationMs,
      promptMessages: _.cloneDeep(r.promptMessages),
      aiOutput: r.rawResponse,
      aiReasoning: r.reasoningContent?.trim() || '',
      apiPresetUsed: r.apiPresetUsed,
    })),
  };
  saveSettings(settings);
}

async function finalizeReplicaRuntimeState(
  baseSettings: ScriptSettings,
  effectiveSettings: ScriptSettings,
  newlyCreatedReplicaIds: string[],
): Promise<void> {
  if (newlyCreatedReplicaIds.length) {
    effectiveSettings.tasks = resetNewlyCreatedReplicaLaunched(
      effectiveSettings.tasks,
      newlyCreatedReplicaIds,
    );
  }
  await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
}

async function runReplicaFamilyCleanupIfDue(
  baseSettings: ScriptSettings,
  effectiveSettings: ScriptSettings,
  messageId: number,
): Promise<void> {
  tickCleanupRound(effectiveSettings);
  if (!shouldTriggerCleanup(effectiveSettings)) return;

  const cleanup = effectiveSettings.replicaFamilyCleanup;
  if (cleanup.mode === 'auto') {
    const keepSet = computeAutoKeepSet(effectiveSettings);
    const next = applyReplicaFamilyCleanup(effectiveSettings, keepSet, messageId);
    Object.assign(effectiveSettings, next);
    await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
    return;
  }

  await new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });

  const result = await showReplicaFamilyCleanupDialog(effectiveSettings);
  if (!result) return;
  const next = applyReplicaFamilyCleanup(
    effectiveSettings,
    result.keepByRoot,
    messageId,
    result.persistManualKeep ? { persistManualKeepByRoot: result.keepByRoot } : undefined,
  );
  Object.assign(effectiveSettings, next);
  await persistRuntimeTaskChanges(baseSettings, effectiveSettings);
}

/** 自动触发时接受的消息类型（手动 force 不受限） */
const AUTO_TRIGGER_MESSAGE_TYPES = new Set([
  'normal',
  'regenerate',
  'continue',
  'impersonate',
  'append',
  'appendFinal',
  'swipe',
]);

const CONTENT_REFRESH_MESSAGE_TYPES = new Set(['regenerate', 'swipe', 'continue', 'append', 'appendFinal']);

/** 防止 GENERATION_ENDED 与 MESSAGE_RECEIVED 重复触发 */
const recentAutoTriggerAt = new Map<number, number>();
const AUTO_TRIGGER_DEDUP_MS = 3000;

function isAutoTriggerMessageType(type: string): boolean {
  return AUTO_TRIGGER_MESSAGE_TYPES.has(type);
}

function isContentRefreshMessageType(type: string): boolean {
  return CONTENT_REFRESH_MESSAGE_TYPES.has(type);
}

function shouldDedupAutoTrigger(messageId: number): boolean {
  const now = Date.now();
  const last = recentAutoTriggerAt.get(messageId) ?? 0;
  if (now - last < AUTO_TRIGGER_DEDUP_MS) return true;
  recentAutoTriggerAt.set(messageId, now);
  if (recentAutoTriggerAt.size > 32) {
    for (const [id, at] of recentAutoTriggerAt) {
      if (now - at > 60_000) recentAutoTriggerAt.delete(id);
    }
  }
  return false;
}

function scheduleAutoTrigger(
  messageId: number,
  type: string,
  source: 'message_received' | 'generation_ended',
): void {
  if (isMvuDeferActive() && source === 'message_received') return;
  if (shouldSuppressAutoTriggerAfterAbort()) return;
  if (shouldDedupAutoTrigger(messageId)) return;
  void handleMessageReceived(messageId, type, { fromGenerationEnded: source === 'generation_ended' });
}

export async function handleMessageReceived(
  messageId: number,
  type: string,
  options?: {
    bypassSchedule?: boolean;
    force?: boolean;
    isRerun?: boolean;
    taskIdFilter?: string;
    fromGenerationEnded?: boolean;
  },
): Promise<void> {
  const baseSettings = loadSettings();
  const settings = resolveEffectiveSettings(baseSettings);
  const resolved = resolveAutoTriggerMessageId(messageId);
  const targetId = resolved?.id;
  if (targetId == null) return;
  if (!settings.enabled && !options?.force) return;
  if (!isAutoTriggerMessageType(type) && !options?.force && !options?.fromGenerationEnded) return;
  if (isPostProcessSilent()) return;
  if (isProcessing(targetId)) return;

  const msg = getChatMessages(targetId)[0];
  if (!msg || msg.role !== 'assistant') return;

  const hadDoneFlag = !!(msg.data as Record<string, unknown>)?._post_process_done;
  const isRerun =
    options?.isRerun ??
    (hadDoneFlag &&
      (options?.fromGenerationEnded === true || isContentRefreshMessageType(type)));

  if (!options?.force && hadDoneFlag && !isRerun) return;

  markProcessing(targetId);
  const signal = beginRun();
  showTaskProgressToast('正在准备工作流任务...', () => {
    requestCancelRun();
  });

  const onProgress = (update: TaskProgressUpdate) => {
    if (isTaskProgressStopping()) return;
    updateTaskProgressToast(update);
  };

  try {
    if (isRerun) {
      restorePostProcessTagsFromPreviousFloor(targetId);
      await restoreBodyReplaceOrigin(targetId);
    }
    await ensureBodyReplaceOriginCaptured(targetId);
    applyAssistantChatTagExtract(targetId, settings, { isRerun });

    const snapshot = captureDataSnapshot();
    const { results, cancelled, newlyCreatedReplicaIds, executedMemberIds } = await runPostProcessTasks(
      settings,
      snapshot,
      targetId,
      {
        bypassSchedule: options?.bypassSchedule ?? false,
        isRerun,
        signal,
        onProgress,
        taskIdFilter: options?.taskIdFilter,
      },
    );

    baseSettings.scheduleState = _.cloneDeep(settings.scheduleState);
    persistRunStatus(baseSettings, targetId, results);

    if (cancelled) {
      acuToast('warning', '工作流已由用户取消');
      return;
    }

    const hasSuccess = results.some(r => r.success && !r.skipped);
    if (hasSuccess) {
      await applyTagVariableInjectTemplate(settings, results, targetId);

      const aiBlock = await mergeAiFloorInjectBlock(settings, results, targetId);
      await injectToAiFloor(targetId, aiBlock, { isRerun });
      await applyInjectVariableUpdates(targetId, aiBlock, { isRerun });
    }

    incrementReplicaRunCounts(settings, executedMemberIds);
    await finalizeReplicaRuntimeState(baseSettings, settings, newlyCreatedReplicaIds);

    if (settings.messageVarRetention?.enabled) {
      const { cleanupOldMessageFloorVariables } = await import('./message-var-retention');
      cleanupOldMessageFloorVariables(settings.messageVarRetention.keepFloors);
    }

    hideTaskProgressToast();
    await runReplicaFamilyCleanupIfDue(baseSettings, settings, targetId);
  } catch (e) {
    console.error(SCRIPT_LOG_PREFIX, e);
    acuToast('error', `工作流执行失败: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    hideTaskProgressToast();
    endRun();
    unmarkProcessing(targetId);
  }
}

export function registerTrigger(): EventOnReturn {
  const offDefer = registerMvuDeferredTrigger(handleMessageReceived);

  const offImmediate = eventOn(tavern_events.MESSAGE_RECEIVED, (messageId, type) => {
    if (!isAutoTriggerMessageType(type)) return;
    scheduleAutoTrigger(messageId, type, 'message_received');
  });

  const offGenerationEnded = eventMakeLast(tavern_events.GENERATION_ENDED, (messageId: number) => {
    scheduleAutoTrigger(messageId, 'normal', 'generation_ended');
  });

  const offGenerationStopped = eventOn(tavern_events.GENERATION_STOPPED, () => {
    markChatGenerationAborted();
  });

  const offGenerationStarted = eventOn(tavern_events.GENERATION_STARTED, () => {
    markChatGenerationStarted();
  });

  return {
    stop: () => {
      offImmediate.stop();
      offGenerationEnded.stop();
      offGenerationStopped.stop();
      offGenerationStarted.stop();
      offDefer.stop();
    },
  };
}

export type TriggerTaskOptions = {
  bypassSchedule?: boolean;
  isRerun?: boolean;
};

export async function rerunCurrentFloor(): Promise<void> {
  const lastId = resolveManualRerunFloorId();
  if (lastId == null) {
    acuToast('warning', '当前没有可执行工作流的 AI 回复楼层');
    return;
  }
  const msg = getChatMessages(lastId)[0];
  if (!msg || msg.role !== 'assistant') {
    acuToast('warning', '当前最后一楼不是 AI 回复');
    return;
  }
  await handleMessageReceived(lastId, 'normal', { bypassSchedule: true, force: true, isRerun: true });
}

export async function triggerTask(taskId: string, options?: TriggerTaskOptions): Promise<void> {
  const trimmed = taskId?.trim();
  if (!trimmed) throw new Error('任务 ID 不能为空');
  const lastId = resolveManualRerunFloorId();
  if (lastId == null) {
    acuToast('warning', '当前没有可执行工作流的 AI 回复楼层');
    return;
  }
  const msg = getChatMessages(lastId)[0];
  if (!msg || msg.role !== 'assistant') {
    acuToast('warning', '当前最后一楼不是 AI 回复');
    return;
  }
  await handleMessageReceived(lastId, 'normal', {
    bypassSchedule: options?.bypassSchedule ?? true,
    force: true,
    isRerun: options?.isRerun ?? true,
    taskIdFilter: trimmed,
  });
}
