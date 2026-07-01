import {
  buildChatCompletionPayload,
  buildCustomApiFromConfig,
} from './api-preset-utils';
import type { ResolvedApi } from './resolve';
import type { ApiConfig } from '../tasks/schema';
import { registerGenerationId, unregisterGenerationId } from '../tasks/run-control';

type RolePrompt = { role: 'system' | 'user' | 'assistant'; content: string };

export interface ApiCallResult {
  content: string;
  reasoningContent?: string;
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

async function callViaChatCompletionService(messages: RolePrompt[], apiConfig: ApiConfig): Promise<ApiCallResult> {
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
  const body = buildChatCompletionPayload(messages, apiConfig);
  const result = await service.processRequest(body, {}, true, null);
  return extractApiCallResult(result);
}

async function callViaGenerateRaw(
  messages: RolePrompt[],
  generationId: string,
  apiConfig: ApiConfig,
): Promise<ApiCallResult> {
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
  return { content: typeof result === 'string' ? result : '' };
}

export async function callWithResolvedApi(
  messages: RolePrompt[],
  resolved: ResolvedApi,
  generationId?: string,
): Promise<ApiCallResult> {
  const genId = generationId || `post-process-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { apiConfig } = resolved;
  assertCustomApiConfig(apiConfig);
  registerGenerationId(genId);
  try {
    try {
      return await callViaChatCompletionService(messages, apiConfig);
    } catch (err) {
      console.warn('[AI回复后处理] ChatCompletionService 失败，回退 generateRaw:', err);
      return await callViaGenerateRaw(messages, genId, apiConfig);
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
): Promise<ApiCallResult> {
  return callWithResolvedApi(messages, { apiConfig }, generationId);
}
