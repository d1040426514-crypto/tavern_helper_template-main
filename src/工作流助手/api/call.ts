import {
  apiFormatDisallowsGenerateRawFallback,
  buildChatCompletionPayload,
  buildCustomApiFromConfig,
  hasApiBodyExtras,
  omitPromptLogNames,
  type ApiPayloadOverrides,
} from './api-preset-utils';
import { isTauriTavernHost } from './host-detect';
import type { ResolvedApi } from './resolve';
import type { ApiConfig } from '../tasks/schema';
import { checkRunCancelled, registerGenerationId, RunCancelledError, unregisterGenerationId } from '../tasks/run-control';

type RolePrompt = { role: 'system' | 'user' | 'assistant'; content: string };

export interface ApiCallResult {
  content: string;
  reasoningContent?: string;
}

export const DEFAULT_API_TIMEOUT_SEC = 300;

export class ApiCallTimeoutError extends Error {
  constructor(timeoutSec: number) {
    super(`API 请求超时（${timeoutSec}s）`);
    this.name = 'ApiCallTimeoutError';
  }
}

export function resolveApiTimeoutMs(timeoutSec: number | undefined): number {
  const sec = Math.floor(Number(timeoutSec));
  if (!Number.isFinite(sec) || sec < 1) return DEFAULT_API_TIMEOUT_SEC * 1000;
  return sec * 1000;
}

export interface ApiCallOptions {
  payloadOverrides?: ApiPayloadOverrides;
  /** 结构化 API 参数需 CC 路径；为 true 时禁止 generateRaw 回退 */
  disallowGenerateRawFallback?: boolean;
  signal?: AbortSignal;
  /** 单次请求超时毫秒；缺省 300 秒 */
  timeoutMs?: number;
}

export interface RaceApiCallOptions<T> {
  timeoutMs: number;
  parentSignal?: AbortSignal;
  /** 仅 generateRaw 回退：到点按该 id 停止，避免误触主对话的停止生成 */
  stopOnTimeout?: boolean;
  generationId?: string;
  stopGeneration?: (generationId: string) => void;
  run: (signal: AbortSignal) => Promise<T>;
}

function linkAbortSignal(target: AbortController, source: AbortSignal): () => void {
  if (source.aborted) {
    target.abort();
    return () => undefined;
  }
  const onAbort = () => target.abort();
  source.addEventListener('abort', onAbort, { once: true });
  return () => source.removeEventListener('abort', onAbort);
}

/** 单次请求硬超时。父信号取消仍是 RunCancelledError；到点是 ApiCallTimeoutError，不弹提示。 */
export async function raceApiCall<T>(options: RaceApiCallOptions<T>): Promise<T> {
  const parentSignal = options.parentSignal;
  if (parentSignal?.aborted) throw new RunCancelledError();

  const timeoutSec = Math.max(1, Math.round(options.timeoutMs / 1000));
  const timeoutController = new AbortController();
  const callController = new AbortController();
  const unlinkParent = parentSignal ? linkAbortSignal(callController, parentSignal) : () => undefined;
  const unlinkTimeout = linkAbortSignal(callController, timeoutController.signal);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let detachParent = () => {};
  let timedOut = false;

  const runPromise = options.run(callController.signal).then(
    value => ({ status: 'ok' as const, value }),
    error => ({ status: 'err' as const, error }),
  );

  try {
    const winner = await new Promise<Awaited<typeof runPromise> | 'timeout' | 'cancel'>((resolve, reject) => {
      timer = setTimeout(() => {
        if (parentSignal?.aborted) {
          resolve('cancel');
          return;
        }
        timedOut = true;
        timeoutController.abort();
        if (options.stopOnTimeout && options.generationId) {
          try {
            (options.stopGeneration ?? stopGenerationById)(options.generationId);
          } catch {
            // 停止失败不改变超时结果
          }
        }
        console.warn(`[工作流助手] API 请求超时（${timeoutSec}s）`);
        resolve('timeout');
      }, options.timeoutMs);

      if (parentSignal) {
        if (parentSignal.aborted) {
          resolve('cancel');
        } else {
          const onParent = () => resolve('cancel');
          parentSignal.addEventListener('abort', onParent, { once: true });
          detachParent = () => parentSignal.removeEventListener('abort', onParent);
        }
      }

      runPromise.then(resolve, reject);
    });

    if (winner === 'cancel' || parentSignal?.aborted) throw new RunCancelledError();
    if (winner === 'timeout' || timedOut) throw new ApiCallTimeoutError(timeoutSec);
    if (winner.status === 'err') {
      const error = winner.error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiCallTimeoutError(timeoutSec);
      }
      throw error;
    }
    return winner.value;
  } finally {
    if (timer) clearTimeout(timer);
    detachParent();
    unlinkParent();
    unlinkTimeout();
  }
}

function isAbortLikeError(e: unknown): boolean {
  if (e instanceof RunCancelledError) return true;
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  return false;
}

type ChoiceMessage = {
  content?: string;
  reasoning_content?: string;
  reasoning?: string;
};

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function extractReasoningContent(result: Record<string, unknown>): string | undefined {
  // SillyTavern extractData=true 时返回 ExtractedData：{ content, reasoning }
  const stExtracted = trimOptional(result.reasoning);
  if (stExtracted) return stExtracted;

  const topLevel = trimOptional(result.reasoning_content);
  if (topLevel) return topLevel;

  const directMessage = result.message as ChoiceMessage | undefined;
  if (directMessage) {
    const fromDirect = trimOptional(directMessage.reasoning_content) ?? trimOptional(directMessage.reasoning);
    if (fromDirect) return fromDirect;
  }

  const choices = result.choices as Array<{ message?: ChoiceMessage }> | undefined;
  const message = choices?.[0]?.message;
  if (!message) return undefined;

  return trimOptional(message.reasoning_content) ?? trimOptional(message.reasoning);
}

export function extractApiCallResult(result: unknown): ApiCallResult {
  if (typeof result === 'string') {
    return { content: result.trim() };
  }
  if (!result || typeof result !== 'object') {
    return { content: '' };
  }

  const r = result as Record<string, unknown>;
  let content = '';
  if (typeof r.content === 'string') content = r.content.trim();
  else if (typeof r.text === 'string') content = r.text.trim();
  else {
    const choices = r.choices as Array<{ message?: ChoiceMessage; text?: string }> | undefined;
    const first = choices?.[0];
    if (typeof first?.message?.content === 'string') content = first.message.content.trim();
    else if (typeof first?.text === 'string') content = first.text.trim();
  }

  const reasoningContent = extractReasoningContent(r);
  if (reasoningContent && reasoningContent === content) {
    return { content };
  }
  return reasoningContent ? { content, reasoningContent } : { content };
}

function assertCustomApiConfig(apiConfig: ApiConfig): void {
  if (!apiConfig.url?.trim()) throw new Error('API 预设需填写端点(基础URL)');
  if (!apiConfig.model?.trim()) throw new Error('API 预设需填写模型名');
}

async function callViaChatCompletionService(
  messages: RolePrompt[],
  apiConfig: ApiConfig,
  options?: ApiCallOptions,
): Promise<ApiCallResult> {
  const parent = window.parent as Window & {
    SillyTavern?: { getContext?: () => { ChatCompletionService?: {
      processRequest: (
        body: Record<string, unknown>,
        options: Record<string, unknown>,
        extractData: boolean,
        signal: AbortSignal | null,
      ) => Promise<unknown>;
    } } };
  };
  const service = parent.SillyTavern?.getContext?.()?.ChatCompletionService;
  if (!service?.processRequest) {
    throw new Error('酒馆 ChatCompletionService 不可用');
  }
  const body = buildChatCompletionPayload(messages, apiConfig, options?.payloadOverrides);
  const signal = options?.signal ?? null;
  checkRunCancelled(signal ?? undefined);
  const result = await service.processRequest(body, {}, true, signal);
  checkRunCancelled(signal ?? undefined);
  return extractApiCallResult(result);
}

async function callViaGenerateRaw(
  messages: RolePrompt[],
  generationId: string,
  apiConfig: ApiConfig,
  signal?: AbortSignal,
): Promise<ApiCallResult> {
  checkRunCancelled(signal);
  const result = await generateRaw({
    ordered_prompts: messages,
    should_silence: true,
    max_chat_history: 0,
    generation_id: generationId,
    custom_api: buildCustomApiFromConfig(apiConfig),
    overrides: {
      world_info_before: '',
      world_info_after: '',
      persona_description: '',
      char_description: '',
      char_personality: '',
      scenario: '',
      dialogue_examples: '',
      chat_history: {
        with_depth_entries: false,
        prompts: [],
      },
    },
  });
  checkRunCancelled(signal);
  return { content: typeof result === 'string' ? result : '' };
}

function shouldDisallowGenerateRawFallback(apiConfig: ApiConfig, options?: ApiCallOptions): boolean {
  return Boolean(
    options?.disallowGenerateRawFallback ||
      hasApiBodyExtras(apiConfig) ||
      apiFormatDisallowsGenerateRawFallback(apiConfig.customApiFormat, isTauriTavernHost()),
  );
}

export async function callWithResolvedApi(
  messages: (RolePrompt & { name?: string })[],
  resolved: ResolvedApi,
  generationId?: string,
  options?: ApiCallOptions,
): Promise<ApiCallResult> {
  const apiMessages = omitPromptLogNames(messages);
  const genId = generationId || `post-process-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { apiConfig } = resolved;
  const signal = options?.signal;
  const timeoutMs =
    options?.timeoutMs != null && Number.isFinite(options.timeoutMs) && options.timeoutMs >= 1
      ? options.timeoutMs
      : DEFAULT_API_TIMEOUT_SEC * 1000;
  assertCustomApiConfig(apiConfig);
  registerGenerationId(genId);
  try {
    try {
      return await raceApiCall({
        timeoutMs,
        parentSignal: signal,
        run: callSignal => callViaChatCompletionService(apiMessages, apiConfig, { ...options, signal: callSignal }),
      });
    } catch (err) {
      if (err instanceof ApiCallTimeoutError) throw err;
      if (isAbortLikeError(err) || signal?.aborted) {
        throw new RunCancelledError();
      }
      if (shouldDisallowGenerateRawFallback(apiConfig, options)) {
        const detail = err instanceof Error ? err.message : String(err);
        const formatBlocksRaw = apiFormatDisallowsGenerateRawFallback(
          apiConfig.customApiFormat,
          isTauriTavernHost(),
        );
        const why = !formatBlocksRaw
          ? '结构化 API 参数需 CC 路径'
          : isTauriTavernHost()
            ? 'TauriTavern 接口协议需 CC 路径'
            : 'Claude / Gemini 接口协议需 CC 路径';
        throw new Error(`ChatCompletionService 失败且无法回退 generateRaw（${why}）: ${detail}`);
      }
      console.warn('[工作流助手] ChatCompletionService 失败，回退 generateRaw:', err);
      return await raceApiCall({
        timeoutMs,
        parentSignal: signal,
        stopOnTimeout: true,
        generationId: genId,
        run: () => callViaGenerateRaw(apiMessages, genId, apiConfig, signal),
      });
    }
  } finally {
    unregisterGenerationId(genId);
  }
}

/** @deprecated 使用 callWithResolvedApi */
export async function callWithApiConfig(
  messages: RolePrompt[],
  apiConfig: ApiConfig,
  generationId?: string,
  options?: ApiCallOptions,
): Promise<ApiCallResult> {
  return callWithResolvedApi(messages, { apiConfig }, generationId, options);
}
