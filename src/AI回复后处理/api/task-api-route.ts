import { callWithResolvedApi } from './call';
import { resolveApiPresetFull } from './resolve';
import {
  apiConfigRequiresChatCompletionPath,
  enrichApiConfigForStructuredTask,
  type ActiveStructuredOutputMode,
} from '../tasks/strict-variable-response';
import type { RunLogMessage, ScriptSettings } from '../tasks/schema';

export interface TaskApiRouteCallResult {
  content: string;
  reasoningContent?: string;
  usedPresetName: string;
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
  },
): Promise<TaskApiRouteCallResult> {
  if (!presetChain.length) {
    throw new Error('无可用 API 预设');
  }

  const callApi = options?.callApi ?? callWithResolvedApi;
  let lastError = '';
  for (let i = 0; i < presetChain.length; i++) {
    const presetName = presetChain[i]!;
    const { apiConfig } = resolveApiPresetFull(settings, presetName);
    const enriched = structuredMode
      ? enrichApiConfigForStructuredTask(apiConfig, structuredMode)
      : apiConfig;
    try {
      const apiResult = await callApi(
        messages,
        { apiConfig: enriched },
        `${generationIdBase}-route-${i}`,
        {
          disallowGenerateRawFallback:
            options?.disallowGenerateRawFallback ??
            (structuredMode != null || apiConfigRequiresChatCompletionPath(enriched)),
          payloadOverrides: structuredMode ? { customPromptPostProcessing: 'strict' } : undefined,
        },
      );
      return {
        content: apiResult.content,
        reasoningContent: apiResult.reasoningContent,
        usedPresetName: presetName,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (i < presetChain.length - 1) continue;
    }
  }

  throw new Error(lastError || 'API 调用失败');
}
