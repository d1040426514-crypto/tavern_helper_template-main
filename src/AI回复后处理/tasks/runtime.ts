import { getEffectiveApi } from '../api/resolve';
import { callWithResolvedApi } from '../api/call';
import {
  buildSharedContext,
  renderTaskMessages,
  resolveTaskPlaceholders,
  type SharedContext,
} from './placeholders';
import { countAssistantRounds, shouldRunTask, updateScheduleStateAfterRun, type ScheduleContext } from './schedule';
import {
  abortableDelay,
  checkRunCancelled,
  isRunCancelled,
  RunCancelledError,
} from './run-control';
import {
  extractPlotTagsFromResponse,
  mergeRelayTagMap,
  type RelayTagMap,
} from './utils';
import type { PostProcessTask, ScriptSettings } from './schema';
import type { DataSnapshot } from '../bridge/database-api';

export interface TaskRunResult {
  taskId: string;
  taskName: string;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  /** 全部摘取内容，用于 {{task:任务名}} */
  extractedBlock: string;
  extractedTags: Record<string, string>;
  injectOnlyTagNames: string[];
  rawResponse: string;
  reasoningContent?: string;
  promptMessages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  durationMs: number;
  stage: number;
}

const processingIds = new Set<number>();
let silentGenerationDepth = 0;
let lastPromptMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
let lastPlaceholderVars: Record<string, string> = {};

export function getLastPromptMessages(): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  return _.cloneDeep(lastPromptMessages);
}

export function getLastPlaceholderVars(): Record<string, string> {
  return _.cloneDeep(lastPlaceholderVars);
}

export function isPostProcessSilent(): boolean {
  return silentGenerationDepth > 0;
}

export function markProcessing(messageId: number): void {
  processingIds.add(messageId);
}

export function unmarkProcessing(messageId: number): void {
  processingIds.delete(messageId);
}

export function isProcessing(messageId: number): boolean {
  return processingIds.has(messageId);
}

function taskHasSkipTags(task: PostProcessTask, aiText: string): boolean {
  if (!task.skipIfTagsFound?.length) return false;
  return task.skipIfTagsFound.some(tag => aiText.toLowerCase().includes(`<${tag.toLowerCase()}>`));
}

async function runSingleTask(
  task: PostProcessTask,
  ctx: SharedContext,
  relayTagMap: RelayTagMap,
  scheduleCtx: ScheduleContext,
  options?: { signal?: AbortSignal; onProgress?: (message: string) => void },
): Promise<TaskRunResult> {
  const start = Date.now();
  checkRunCancelled(options?.signal);
  const state = ctx.settings.scheduleState[task.id];
  const scheduleCheck = shouldRunTask(task, state, scheduleCtx);
  if (!scheduleCheck.run) {
    return {
      taskId: task.id,
      taskName: task.name,
      success: false,
      skipped: true,
      skipReason: scheduleCheck.reason,
      extractedBlock: '',
      extractedTags: {},
      injectOnlyTagNames: [],
      rawResponse: '',
      promptMessages: [],
      durationMs: Date.now() - start,
      stage: task.stage,
    };
  }

  if (taskHasSkipTags(task, ctx.aiText)) {
    return {
      taskId: task.id,
      taskName: task.name,
      success: false,
      skipped: true,
      skipReason: 'AI 正文已含跳过标签',
      extractedBlock: '',
      extractedTags: {},
      injectOnlyTagNames: [],
      rawResponse: '',
      promptMessages: [],
      durationMs: Date.now() - start,
      stage: task.stage,
    };
  }

  const vars = await resolveTaskPlaceholders(task, ctx, relayTagMap);
  checkRunCancelled(options?.signal);
  lastPlaceholderVars = _.cloneDeep(vars);
  const messages = await renderTaskMessages(
    task,
    vars,
    relayTagMap,
    ctx.messageVarHistoryMap,
    ctx.injectOnlyTagsUnion,
    ctx.messageId,
  );
  if (!messages.length) {
    return {
      taskId: task.id,
      taskName: task.name,
      success: false,
      skipReason: '无有效提示词',
      extractedBlock: '',
      extractedTags: {},
      injectOnlyTagNames: [],
      rawResponse: '',
      promptMessages: [],
      durationMs: Date.now() - start,
      stage: task.stage,
    };
  }

  const resolvedApi = getEffectiveApi(ctx.settings, task.id, task.apiPresetName);
  const maxRetries = task.maxRetries ?? 3;
  let rawResponse = '';
  let reasoningContent: string | undefined;
  let lastError = '';

  lastPromptMessages = _.cloneDeep(messages);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    checkRunCancelled(options?.signal);
    options?.onProgress?.(`正在执行任务：${task.name}（阶段 ${task.stage}）`);
    try {
      silentGenerationDepth++;
      const apiResult = await callWithResolvedApi(
        messages,
        resolvedApi,
        `post-process-${task.id}-${ctx.messageId}-${attempt}`,
      );
      rawResponse = apiResult.content;
      reasoningContent = apiResult.reasoningContent;
    } catch (e) {
      if (e instanceof RunCancelledError || isRunCancelled(options?.signal)) {
        throw new RunCancelledError();
      }
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    } finally {
      silentGenerationDepth = Math.max(0, silentGenerationDepth - 1);
    }
    checkRunCancelled(options?.signal);
    if ((rawResponse?.trim().length ?? 0) >= (task.minLength ?? 0)) break;
    lastError = '响应过短';
    if (attempt < maxRetries - 1) {
      await abortableDelay(1000, options?.signal);
    }
  }

  const plotExtraction = extractPlotTagsFromResponse(rawResponse, task.extractInjectTags ?? []);
  const hasTags = Object.keys(plotExtraction.extractedTags).length > 0;
  const extractedBlock = hasTags
    ? plotExtraction.injectedFragments.join('\n\n')
    : rawResponse.trim();

  const success = hasTags || extractedBlock.length >= (task.minLength ?? 0);
  if (success) {
    updateScheduleStateAfterRun(ctx.settings, task, scheduleCtx);
  }

  return {
    taskId: task.id,
    taskName: task.name,
    success,
    skipReason: success ? undefined : lastError || '提取失败',
    extractedBlock,
    extractedTags: plotExtraction.extractedTags,
    injectOnlyTagNames: plotExtraction.injectOnlyTagNames,
    rawResponse,
    reasoningContent,
    promptMessages: messages,
    durationMs: Date.now() - start,
    stage: task.stage,
  };
}

function groupTasksByStage(tasks: PostProcessTask[]): PostProcessTask[][] {
  const sorted = [...tasks].sort((a, b) => a.stage - b.stage || a.order - b.order);
  const groups: PostProcessTask[][] = [];
  let currentStage = -1;
  for (const task of sorted) {
    if (task.stage !== currentStage) {
      groups.push([]);
      currentStage = task.stage;
    }
    groups[groups.length - 1].push(task);
  }
  return groups;
}

export interface RunPostProcessOptions {
  bypassSchedule?: boolean;
  isRerun?: boolean;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export async function runPostProcessTasks(
  settings: ScriptSettings,
  snapshot: DataSnapshot,
  messageId: number,
  options?: RunPostProcessOptions,
): Promise<{ results: TaskRunResult[]; ctx: SharedContext; cancelled?: boolean }> {
  const ctx = await buildSharedContext(messageId, settings, snapshot, { isRerun: options?.isRerun });
  checkRunCancelled(options?.signal);
  const enabledTasks = settings.tasks.filter(t => t.enabled);
  if (!enabledTasks.length) {
    return { results: [], ctx };
  }

  options?.onProgress?.('正在准备后处理任务...');
  const scheduleCtx: ScheduleContext = {
    currentRound: countAssistantRounds(),
    currentAiText: ctx.aiText,
    currentPairText: [ctx.userText, ctx.aiText].filter(Boolean).join('\n'),
    settings,
    bypassSchedule: options?.bypassSchedule ?? false,
  };

  const results: TaskRunResult[] = [];
  const aggregatedRelayTags: RelayTagMap = new Map();
  let cancelled = false;

  try {
    for (const stageTasks of groupTasksByStage(enabledTasks)) {
      checkRunCancelled(options?.signal);
      const stageNo = stageTasks[0]?.stage ?? 1;
      const stageTaskNames = stageTasks.map(t => t.name).join('、');
      if (stageTasks.length === 1) {
        options?.onProgress?.(`正在执行任务：${stageTaskNames}（阶段 ${stageNo}）`);
      } else {
        options?.onProgress?.(`正在执行阶段 ${stageNo}：${stageTaskNames}`);
      }

      const stageRelayTagMap = new Map(aggregatedRelayTags);
      const runOptions = { signal: options?.signal, onProgress: options?.onProgress };
      const stageResults = await Promise.all(
        stageTasks.map(task => runSingleTask(task, ctx, stageRelayTagMap, scheduleCtx, runOptions)),
      );
      checkRunCancelled(options?.signal);
      results.push(...stageResults);

      for (const r of stageResults) {
        if (r.success && Object.keys(r.extractedTags).length) {
          mergeRelayTagMap(aggregatedRelayTags, r.extractedTags);
        }
      }
    }
  } catch (e) {
    if (e instanceof RunCancelledError || isRunCancelled(options?.signal)) {
      cancelled = true;
    } else {
      throw e;
    }
  }

  return { results, ctx, cancelled };
}
