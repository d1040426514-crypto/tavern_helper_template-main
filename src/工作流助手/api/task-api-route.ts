import { callWithResolvedApi } from './call';
import { resolveApiPresetFull } from './resolve';
import type { TaskApiRouteConcurrencyPool } from './route-concurrency-pool';
import {
  apiConfigRequiresChatCompletionPath,
  enrichApiConfigForStructuredTask,
  type ActiveStructuredOutputMode,
} from '../tasks/strict-variable-response';
import { RunCancelledError } from '../tasks/run-control';
import type { RunLogMessage, ScriptSettings } from '../tasks/schema';

function isAbortLikeError(e: unknown): boolean {
  if (e instanceof RunCancelledError) return true;
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  return false;
}

export interface TaskApiRouteCallResult {
  content: string;
  reasoningContent?: string;
  usedPresetName: string;
}

/** 软失败后下一次从刚返回内容的预设的下一个开始；硬失败回到主要预设。 */
export function nextRouteCursor(chain: readonly string[], failure: { soft: boolean; usedPresetName?: string }): number {
  if (!failure.soft || !failure.usedPresetName || chain.length === 0) return 0;
  const index = chain.indexOf(failure.usedPresetName);
  if (index < 0) return 0;
  return (index + 1) % chain.length;
}

function normalizeStartIndex(presetChain: readonly string[], startIndex: number | undefined): number {
  if (!startIndex || startIndex <= 0 || startIndex >= presetChain.length) return 0;
  return startIndex;
}

async function callSinglePresetRoute(
  messages: RunLogMessage[],
  settings: ScriptSettings,
  presetName: string,
  structuredMode: ActiveStructuredOutputMode | null,
  generationId: string,
  callApi: typeof callWithResolvedApi,
  options?: { disallowGenerateRawFallback?: boolean; signal?: AbortSignal; timeoutMs?: number },
): Promise<TaskApiRouteCallResult> {
  const { apiConfig } = resolveApiPresetFull(settings, presetName);
  const enriched = structuredMode ? enrichApiConfigForStructuredTask(apiConfig, structuredMode) : apiConfig;
  const apiResult = await callApi(messages, { apiConfig: enriched }, generationId, {
    disallowGenerateRawFallback:
      options?.disallowGenerateRawFallback ?? (structuredMode != null || apiConfigRequiresChatCompletionPath(enriched)),
    payloadOverrides: structuredMode ? { customPromptPostProcessing: 'strict' } : undefined,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });
  return {
    content: apiResult.content,
    reasoningContent: apiResult.reasoningContent,
    usedPresetName: presetName,
  };
}

async function callExactRouteWithPool(
  messages: RunLogMessage[],
  settings: ScriptSettings,
  presetName: string,
  structuredMode: ActiveStructuredOutputMode | null,
  generationId: string,
  callApi: typeof callWithResolvedApi,
  pool: TaskApiRouteConcurrencyPool,
  options?: {
    signal?: AbortSignal;
    disallowGenerateRawFallback?: boolean;
    timeoutMs?: number;
  },
): Promise<TaskApiRouteCallResult> {
  const acquiredRoute = await pool.acquire({
    signal: options?.signal,
    preferredRoute: presetName,
    allowedRoutes: [presetName],
  });
  try {
    return await callSinglePresetRoute(messages, settings, presetName, structuredMode, generationId, callApi, {
      disallowGenerateRawFallback: options?.disallowGenerateRawFallback,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    });
  } finally {
    pool.release(acquiredRoute);
  }
}

async function callWithPoolAndFailover(
  messages: RunLogMessage[],
  settings: ScriptSettings,
  presetChain: string[],
  structuredMode: ActiveStructuredOutputMode | null,
  generationIdBase: string,
  callApi: typeof callWithResolvedApi,
  pool: TaskApiRouteConcurrencyPool,
  options?: {
    signal?: AbortSignal;
    startIndex?: number;
    disallowGenerateRawFallback?: boolean;
    timeoutMs?: number;
  },
): Promise<TaskApiRouteCallResult> {
  const startIndex = normalizeStartIndex(presetChain, options?.startIndex);
  const chain = presetChain.slice(startIndex);
  let lastError = '';

  if (startIndex > 0) {
    for (let i = 0; i < chain.length; i++) {
      const presetName = chain[i]!;
      try {
        return await callExactRouteWithPool(
          messages,
          settings,
          presetName,
          structuredMode,
          `${generationIdBase}-route-${presetName}-${i}`,
          callApi,
          pool,
          options,
        );
      } catch (e) {
        if (isAbortLikeError(e) || options?.signal?.aborted) {
          throw new RunCancelledError();
        }
        lastError = e instanceof Error ? e.message : String(e);
        if (i < chain.length - 1) continue;
      }
    }
    throw new Error(lastError || 'API 调用失败');
  }

  const startRoute = await pool.acquire({
    signal: options?.signal,
  });

  const acquiredIndex = chain.indexOf(startRoute);
  const tryOrder = acquiredIndex >= 0 ? [...chain.slice(acquiredIndex), ...chain.slice(0, acquiredIndex)] : [...chain];

  for (let i = 0; i < tryOrder.length; i++) {
    const presetName = tryOrder[i]!;
    let acquiredRoute: string | null = null;
    let shouldRelease = false;

    try {
      if (i === 0) {
        acquiredRoute = startRoute;
      } else {
        acquiredRoute = await pool.acquire({
          signal: options?.signal,
          preferredRoute: presetName,
        });
        shouldRelease = true;
      }

      return await callSinglePresetRoute(
        messages,
        settings,
        presetName,
        structuredMode,
        `${generationIdBase}-route-${presetName}-${i}`,
        callApi,
        {
          disallowGenerateRawFallback: options?.disallowGenerateRawFallback,
          signal: options?.signal,
          timeoutMs: options?.timeoutMs,
        },
      );
    } catch (e) {
      if (isAbortLikeError(e) || options?.signal?.aborted) {
        throw new RunCancelledError();
      }
      lastError = e instanceof Error ? e.message : String(e);
      if (i < tryOrder.length - 1) continue;
    } finally {
      if (shouldRelease && acquiredRoute) {
        pool.release(acquiredRoute);
      }
      if (i === 0 && acquiredRoute) {
        pool.release(acquiredRoute);
      }
    }
  }

  throw new Error(lastError || 'API 调用失败');
}

export async function callTaskApiWithRouteFallback(
  messages: RunLogMessage[],
  settings: ScriptSettings,
  presetChain: string[],
  structuredMode: ActiveStructuredOutputMode | null,
  generationIdBase: string,
  options?: {
    disallowGenerateRawFallback?: boolean;
    callApi?: typeof callWithResolvedApi;
    routePool?: TaskApiRouteConcurrencyPool | null;
    /** 从该下标开始向后试；0 表示整链，含主预设槽满时分流到备用 */
    startIndex?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<TaskApiRouteCallResult> {
  if (!presetChain.length) {
    throw new Error('无可用 API 预设');
  }

  const callApi = options?.callApi ?? callWithResolvedApi;
  const pool = options?.routePool;

  if (pool) {
    return callWithPoolAndFailover(messages, settings, presetChain, structuredMode, generationIdBase, callApi, pool, {
      signal: options?.signal,
      startIndex: options?.startIndex,
      disallowGenerateRawFallback: options?.disallowGenerateRawFallback,
      timeoutMs: options?.timeoutMs,
    });
  }

  const chain = presetChain.slice(normalizeStartIndex(presetChain, options?.startIndex));
  let lastError = '';
  for (let i = 0; i < chain.length; i++) {
    const presetName = chain[i]!;
    try {
      return await callSinglePresetRoute(
        messages,
        settings,
        presetName,
        structuredMode,
        `${generationIdBase}-route-${i}`,
        callApi,
        {
          disallowGenerateRawFallback: options?.disallowGenerateRawFallback,
          signal: options?.signal,
          timeoutMs: options?.timeoutMs,
        },
      );
    } catch (e) {
      if (isAbortLikeError(e) || options?.signal?.aborted) {
        throw new RunCancelledError();
      }
      lastError = e instanceof Error ? e.message : String(e);
      if (i < chain.length - 1) continue;
    }
  }

  throw new Error(lastError || 'API 调用失败');
}
