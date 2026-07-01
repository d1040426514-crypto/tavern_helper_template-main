import { captureDataSnapshot } from '../bridge/database-api';
import { loadSettings, saveSettings } from '../settings';
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
import {
  applyTagVariableInjectTemplate,
  buildInjectOnlyTagsUnion,
  mergeAiFloorInjectBlock,
} from './tag-variables';
import {
  hideTaskProgressToast,
  isTaskProgressStopping,
  showTaskProgressToast,
  updateTaskProgressToast,
} from '../ui/task-progress-toast';
import { registerMvuDeferredTrigger, isMvuDeferActive } from './mvu-trigger-defer';
import { acuToast } from '../ui/toast';

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
      durationMs: r.durationMs,
      promptMessages: _.cloneDeep(r.promptMessages),
      aiOutput: r.rawResponse,
      aiReasoning: r.reasoningContent?.trim() || '',
    })),
  };
  saveSettings(settings);
}

export async function handleMessageReceived(
  messageId: number,
  type: string,
  options?: { bypassSchedule?: boolean; force?: boolean; isRerun?: boolean },
): Promise<void> {
  const settings = loadSettings();
  if (!settings.enabled && !options?.force) return;
  if (type !== 'normal' && !options?.force) return;
  if (isPostProcessSilent()) return;
  if (isProcessing(messageId)) return;

  const msg = getChatMessages(messageId)[0];
  if (!msg || msg.role !== 'assistant') return;
  if (!options?.force && (msg.data as Record<string, unknown>)?._post_process_done) return;

  markProcessing(messageId);
  const signal = beginRun();
  showTaskProgressToast('正在准备后处理任务...', () => {
    requestCancelRun();
  });

  const onProgress = (message: string) => {
    if (isTaskProgressStopping()) return;
    updateTaskProgressToast(message);
  };

  try {
    const snapshot = captureDataSnapshot();
    const { results, cancelled } = await runPostProcessTasks(settings, snapshot, messageId, {
      bypassSchedule: options?.bypassSchedule ?? false,
      isRerun: options?.isRerun ?? false,
      signal,
      onProgress,
    });

    persistRunStatus(settings, messageId, results);

    if (cancelled) {
      acuToast('warning', '后处理已由用户取消');
      return;
    }

    const hasSuccess = results.some(r => r.success && !r.skipped);
    if (!hasSuccess) return;

    await applyTagVariableInjectTemplate(settings, results, messageId);

    const injectOnlyTagsUnion = buildInjectOnlyTagsUnion(settings.tasks);
    const aiBlock = await mergeAiFloorInjectBlock(settings, results, messageId, injectOnlyTagsUnion);
    await injectToAiFloor(messageId, aiBlock, { isRerun: options?.isRerun ?? false });
    await applyInjectVariableUpdates(messageId, aiBlock, { isRerun: options?.isRerun ?? false });
  } catch (e) {
    console.error('[AI回复后处理]', e);
    acuToast('error', `后处理失败: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    hideTaskProgressToast();
    endRun();
    unmarkProcessing(messageId);
  }
}

export function registerTrigger(): EventOnReturn {
  const offDefer = registerMvuDeferredTrigger(handleMessageReceived);

  const offImmediate = eventOn(tavern_events.MESSAGE_RECEIVED, (messageId, type) => {
    if (isMvuDeferActive()) return;
    void handleMessageReceived(messageId, type);
  });

  return {
    stop: () => {
      offImmediate.stop();
      offDefer.stop();
    },
  };
}

export async function rerunCurrentFloor(): Promise<void> {
  const lastId = getLastMessageId();
  const msg = getChatMessages(lastId)[0];
  if (!msg || msg.role !== 'assistant') {
    acuToast('warning', '当前最后一楼不是 AI 回复');
    return;
  }
  await handleMessageReceived(lastId, 'normal', { bypassSchedule: true, force: true, isRerun: true });
}
