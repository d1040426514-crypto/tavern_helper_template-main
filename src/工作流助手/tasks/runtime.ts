import { resolveTaskApiPresetChain } from '../api/resolve';
import { buildRoutePoolKey, RouteConcurrencyPoolRegistry } from '../api/route-concurrency-pool';
import {
  buildRouteConcurrencyLimits,
  hasAnyRouteConcurrencyCap,
} from '../api/route-concurrency-limits';
import { callTaskApiWithRouteFallback } from '../api/task-api-route';
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
import {
  appendStrictJsonPromptToMessages,
  extractStrictVariableResponse,
  hasCompleteVariableXml,
  type ActiveStructuredOutputMode,
} from './strict-variable-response';
import type { PostProcessTask, RunLogMessage, ScriptSettings } from './schema';
import type { DataSnapshot } from '../bridge/database-api';
import type { TaskProgressItem, TaskProgressSnapshot, TaskProgressUpdate } from '../ui/task-progress-toast';
import { applyChatBodyTagReplaceAfterStage } from './chat-body-tag-replace';
import {
  disableReplicaFamilyOnTasks,
  enableReplicaFamilyOnTask,
  getReplicaDisplaySuffix,
  getReplicaFamilyBaseName,
  getReplicaFamilyGroupId,
  prepareStageTasksWithReplicaSync,
} from './replica-family';

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
  promptMessages: RunLogMessage[];
  durationMs: number;
  stage: number;
  apiPresetUsed?: string;
}

const processingIds = new Set<number>();
let silentGenerationDepth = 0;
let lastPromptMessages: RunLogMessage[] = [];
let lastPlaceholderVars: Record<string, string> = {};

export function getLastPromptMessages(): RunLogMessage[] {
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

function getStructuredOutputMode(task: PostProcessTask): ActiveStructuredOutputMode | null {
  const mode = task.structuredOutputMode ?? 'off';
  if (mode === 'off') return null;
  return mode;
}

function resolveStructuredResponse(
  rawResponse: string,
  mode: ActiveStructuredOutputMode,
): { ok: true; text: string } | { ok: false; error: string } {
  const strict = extractStrictVariableResponse(rawResponse, mode);
  if (strict.ok && strict.normalizedXml) {
    return { ok: true, text: strict.normalizedXml };
  }
  if (hasCompleteVariableXml(rawResponse, mode)) {
    return { ok: true, text: rawResponse.trim() };
  }
  return { ok: false, error: strict.retryHint || strict.error || '严格 JSON 解析失败' };
}

async function runSingleTask(
  task: PostProcessTask,
  ctx: SharedContext,
  relayTagMap: RelayTagMap,
  scheduleCtx: ScheduleContext,
  options?: { signal?: AbortSignal; routePoolRegistry?: RouteConcurrencyPoolRegistry },
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

  const presetChain = resolveTaskApiPresetChain(ctx.settings, task.id, task);
  const routeLimits = buildRouteConcurrencyLimits(ctx.settings, task.id, task);
  const poolScopeId = task.replicaFamilyRootId ?? task.id;
  const poolKey = buildRoutePoolKey(poolScopeId, presetChain, routeLimits);
  const routePool = hasAnyRouteConcurrencyCap(routeLimits)
    ? options?.routePoolRegistry?.getOrCreate(poolKey, presetChain, routeLimits)
    : null;
  const structuredMode = getStructuredOutputMode(task);
  const apiMessages = structuredMode ? appendStrictJsonPromptToMessages(messages, structuredMode) : messages;
  const maxRetries = task.maxRetries ?? 3;
  let rawResponse = '';
  let reasoningContent: string | undefined;
  let lastError = '';
  let processedResponse = '';
  let apiPresetUsed: string | undefined;
  let retryOnPrimaryOnly = false;

  lastPromptMessages = _.cloneDeep(apiMessages);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    checkRunCancelled(options?.signal);
    try {
      silentGenerationDepth++;
      const apiResult = await callTaskApiWithRouteFallback(
        apiMessages,
        ctx.settings,
        presetChain,
        structuredMode,
        `post-process-${task.id}-${ctx.messageId}-${attempt}`,
        {
          routePool,
          preferPrimaryOnly: retryOnPrimaryOnly,
          signal: options?.signal,
        },
      );
      rawResponse = apiResult.content;
      reasoningContent = apiResult.reasoningContent;
      apiPresetUsed = apiResult.usedPresetName;
      retryOnPrimaryOnly = false;
    } catch (e) {
      if (
        e instanceof RunCancelledError ||
        isRunCancelled(options?.signal) ||
        (e instanceof DOMException && e.name === 'AbortError')
      ) {
        throw new RunCancelledError();
      }
      lastError = e instanceof Error ? e.message : String(e);
      retryOnPrimaryOnly = false;
      continue;
    } finally {
      silentGenerationDepth = Math.max(0, silentGenerationDepth - 1);
    }
    checkRunCancelled(options?.signal);

    if (structuredMode) {
      const resolved = resolveStructuredResponse(rawResponse, structuredMode);
      if (resolved.ok) {
        processedResponse = resolved.text;
        break;
      }
      lastError = resolved.error;
      retryOnPrimaryOnly = true;
      if (attempt < maxRetries - 1) {
        await abortableDelay(1000, options?.signal);
      }
      continue;
    }

    processedResponse = rawResponse;
    if ((rawResponse?.trim().length ?? 0) >= (task.minLength ?? 0)) break;
    lastError = '响应过短';
    retryOnPrimaryOnly = true;
    if (attempt < maxRetries - 1) {
      await abortableDelay(1000, options?.signal);
    }
  }

  if (!processedResponse && rawResponse) {
    processedResponse = structuredMode ? '' : rawResponse;
  }

  const plotExtraction = extractPlotTagsFromResponse(processedResponse || rawResponse, task.extractInjectTags ?? []);
  const hasTags = Object.keys(plotExtraction.extractedTags).length > 0;
  const responseForBlock = processedResponse || rawResponse;
  const extractedBlock = hasTags
    ? plotExtraction.injectedFragments.join('\n\n')
    : responseForBlock.trim();

  const structuredSuccess = structuredMode != null && processedResponse.trim().length > 0;
  const success = structuredSuccess || hasTags || extractedBlock.length >= (task.minLength ?? 0);
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
    apiPresetUsed,
  };
}

function groupTasksByStage(tasks: PostProcessTask[], listOrder: PostProcessTask[]): PostProcessTask[][] {
  const indexById = new Map(listOrder.map((t, i) => [t.id, i]));
  const sorted = [...tasks].sort((a, b) => {
    if (a.stage !== b.stage) return a.stage - b.stage;
    return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
  });
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

interface StageProgressReporter {
  setRunning(taskId: string): void;
  setFinished(taskId: string, result: TaskRunResult): void;
  pushSnapshot(): void;
}

function createStageProgressReporter(
  stageTasks: PostProcessTask[],
  stageNo: number,
  allTasks: PostProcessTask[],
  onProgress?: (update: TaskProgressUpdate) => void,
): StageProgressReporter {
  const tasks: TaskProgressItem[] = stageTasks.map(t => {
    const suffix = getReplicaDisplaySuffix(t);
    const base = getReplicaFamilyGroupId(t) ? getReplicaFamilyBaseName(t, allTasks) : t.name;
    const displayName = suffix ? `${base} ${suffix}` : t.name;
    const shortName = suffix && getReplicaFamilyGroupId(t) && stageTasks.length >= 2 ? suffix : displayName;
    return {
      taskId: t.id,
      taskName: shortName,
      status: 'pending' as const,
    };
  });

  const pushSnapshot = () => {
    const snapshot: TaskProgressSnapshot = {
      headline: `正在执行阶段${stageNo}`,
      stageNo,
      tasks: tasks.map(t => ({ ...t })),
    };
    onProgress?.(snapshot);
  };

  return {
    setRunning(taskId: string) {
      const item = tasks.find(t => t.taskId === taskId);
      if (item) item.status = 'running';
      pushSnapshot();
    },
    setFinished(taskId: string, result: TaskRunResult) {
      const item = tasks.find(t => t.taskId === taskId);
      if (!item) return;
      if (result.skipped) {
        item.status = 'skipped';
        item.detail = result.skipReason;
      } else if (result.success) {
        item.status = 'done';
        item.detail = undefined;
      } else {
        item.status = 'failed';
        item.detail = result.skipReason;
      }
      pushSnapshot();
    },
    pushSnapshot,
  };
}

export interface RunPostProcessOptions {
  bypassSchedule?: boolean;
  isRerun?: boolean;
  signal?: AbortSignal;
  onProgress?: (update: TaskProgressUpdate) => void;
  /** 设置时仅运行该 id 的已启用任务，不展开副本族 */
  taskIdFilter?: string;
}

export type RunPostProcessResult = {
  results: TaskRunResult[];
  ctx: SharedContext;
  cancelled?: boolean;
  newlyCreatedReplicaIds: string[];
  executedMemberIds: string[];
};

export async function runPostProcessTasks(
  settings: ScriptSettings,
  snapshot: DataSnapshot,
  messageId: number,
  options?: RunPostProcessOptions,
): Promise<RunPostProcessResult> {
  const ctx = await buildSharedContext(messageId, settings, snapshot, { isRerun: options?.isRerun });
  checkRunCancelled(options?.signal);
  let enabledTasks = settings.tasks.filter(t => t.enabled);
  const allNewlyCreatedReplicaIds: string[] = [];
  const allExecutedMemberIds: string[] = [];
  if (options?.taskIdFilter) {
    enabledTasks = enabledTasks.filter(t => t.id === options.taskIdFilter);
    if (!enabledTasks.length) {
      throw new Error(`任务不存在或未启用: ${options.taskIdFilter}`);
    }
  }
  if (!enabledTasks.length) {
    return { results: [], ctx, newlyCreatedReplicaIds: [], executedMemberIds: [] };
  }

  options?.onProgress?.('正在准备工作流任务...');
  const scheduleCtx: ScheduleContext = {
    currentRound: countAssistantRounds(),
    currentAiText: ctx.aiText,
    currentPairText: [ctx.userText, ctx.aiText].filter(Boolean).join('\n'),
    settings,
    bypassSchedule: options?.bypassSchedule ?? false,
  };

  if (options?.taskIdFilter) {
    const task = enabledTasks[0]!;
    const routePoolRegistry = new RouteConcurrencyPoolRegistry();
    const reporter = createStageProgressReporter([task], task.stage, settings.tasks, options?.onProgress);
    reporter.pushSnapshot();
    reporter.setRunning(task.id);
    const result = await runSingleTask(task, ctx, new Map(), scheduleCtx, {
      signal: options?.signal,
      routePoolRegistry,
    });
    reporter.setFinished(task.id, result);
    return {
      results: [result],
      ctx,
      newlyCreatedReplicaIds: [],
      executedMemberIds: result.success && !result.skipped && task.replicaFamilyRootId ? [task.id] : [],
    };
  }

  const results: TaskRunResult[] = [];
  const aggregatedRelayTags: RelayTagMap = new Map();
  const routePoolRegistry = new RouteConcurrencyPoolRegistry();
  let cancelled = false;

  try {
    for (const stageTasksRaw of groupTasksByStage(enabledTasks, settings.tasks)) {
      checkRunCancelled(options?.signal);
      const stageNo = stageTasksRaw[0]?.stage ?? 1;

      const prepared = prepareStageTasksWithReplicaSync(stageTasksRaw, settings.tasks, aggregatedRelayTags);
      settings.tasks = prepared.allTasks;
      allNewlyCreatedReplicaIds.push(...prepared.newlyCreatedReplicaIds);

      const stageTasks = prepared.tasks;
      const skippedRootResults: TaskRunResult[] = prepared.skippedRoots.map(root => ({
        taskId: root.id,
        taskName: root.name,
        success: false,
        skipped: true,
        skipReason: '副本族：上一阶段 relay 无可用属性实例',
        extractedBlock: '',
        extractedTags: {},
        injectOnlyTagNames: [],
        rawResponse: '',
        promptMessages: [],
        durationMs: 0,
        stage: root.stage,
      }));

      if (!stageTasks.length) {
        results.push(...skippedRootResults);
        continue;
      }

      const reporter = createStageProgressReporter(stageTasks, stageNo, settings.tasks, options?.onProgress);
      reporter.pushSnapshot();

      const stageRelayTagMap = new Map(aggregatedRelayTags);
      const runOptions = { signal: options?.signal, routePoolRegistry };
      const stageResults = await Promise.all(
        stageTasks.map(async task => {
          reporter.setRunning(task.id);
          const result = await runSingleTask(task, ctx, stageRelayTagMap, scheduleCtx, runOptions);
          reporter.setFinished(task.id, result);
          return result;
        }),
      );
      checkRunCancelled(options?.signal);
      results.push(...skippedRootResults, ...stageResults);

      for (const r of stageResults) {
        if (r.success && !r.skipped) {
          const task = settings.tasks.find(t => t.id === r.taskId);
          if (task?.replicaFamilyRootId) allExecutedMemberIds.push(r.taskId);
        }
        if (r.success && Object.keys(r.extractedTags).length) {
          mergeRelayTagMap(aggregatedRelayTags, r.extractedTags);
        }
      }

      await applyChatBodyTagReplaceAfterStage({
        messageId: ctx.messageId,
        settings,
        stageResults,
        allStageResults: results,
        ctx,
        onMessageUpdated: text => {
          scheduleCtx.currentAiText = text;
          scheduleCtx.currentPairText = [ctx.userText, text].filter(Boolean).join('\n');
        },
      });
    }
  } catch (e) {
    if (e instanceof RunCancelledError || isRunCancelled(options?.signal)) {
      cancelled = true;
    } else {
      throw e;
    }
  }

  return {
    results,
    ctx,
    cancelled,
    newlyCreatedReplicaIds: allNewlyCreatedReplicaIds,
    executedMemberIds: allExecutedMemberIds,
  };
}
