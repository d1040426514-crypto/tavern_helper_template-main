import type { ApiPresetDraft } from './api-preset-utils';

export const DEEPSEEK_STRUCTURED_BODY_PARAMS_BASE = `response_format:
  type: json_object`;

export const DEEPSEEK_STRUCTURED_EXCLUDE_BODY_PARAMS = 'top_p, reasoning_effort';

export const DEEPSEEK_STRUCTURED_HELP_LINES = [
  '写入 response_format: json_object，并启用 custom_prompt_post_processing: strict。',
  '排除 top_p、reasoning_effort；prompt 须含 json 字样。',
  '默认 thinking: disabled，结构化变量任务更稳。',
  '开启 COT 后改为 thinking: enabled，并设置 include_reasoning: true。',
];

export type ThinkingMode = 'disabled' | 'enabled';

export type DeepSeekDraftSnapshot = Pick<
  ApiPresetDraft,
  'bodyParams' | 'excludeBodyParams' | 'customPromptPostProcessing' | 'includeReasoning' | 'reasoningEffort'
>;

export function snapshotDeepSeekDraftFields(draft: ApiPresetDraft): DeepSeekDraftSnapshot {
  return {
    bodyParams: draft.bodyParams,
    excludeBodyParams: draft.excludeBodyParams,
    customPromptPostProcessing: draft.customPromptPostProcessing,
    includeReasoning: draft.includeReasoning,
    reasoningEffort: draft.reasoningEffort,
  };
}

export function restoreDeepSeekDraftSnapshot(draft: ApiPresetDraft, snapshot: DeepSeekDraftSnapshot): void {
  draft.bodyParams = snapshot.bodyParams;
  draft.excludeBodyParams = snapshot.excludeBodyParams;
  draft.customPromptPostProcessing = snapshot.customPromptPostProcessing;
  draft.includeReasoning = snapshot.includeReasoning;
  draft.reasoningEffort = snapshot.reasoningEffort;
}

export function buildDeepSeekBodyParams(cotEnabled: boolean): string {
  const thinkingType: ThinkingMode = cotEnabled ? 'enabled' : 'disabled';
  return `${DEEPSEEK_STRUCTURED_BODY_PARAMS_BASE}

thinking:
  type: ${thinkingType}`;
}

export function isDeepSeekStructuredBodyParams(bodyParams: string): boolean {
  return /response_format\s*:[\s\S]*json_object/i.test(String(bodyParams || ''));
}

export function readThinkingMode(bodyParams: string): ThinkingMode | null {
  const match = String(bodyParams || '').match(/thinking\s*:\s*\n\s*type\s*:\s*(enabled|disabled)/i);
  if (!match?.[1]) return null;
  return match[1].toLowerCase() as ThinkingMode;
}

export function applyThinkingModeToBodyParams(bodyParams: string, mode: ThinkingMode): string {
  const thinkingBlock = `thinking:\n  type: ${mode}`;
  const source = String(bodyParams || '').trim();
  if (/thinking\s*:\s*\n\s*type\s*:\s*(enabled|disabled)/i.test(source)) {
    return source.replace(/thinking\s*:\s*\n\s*type\s*:\s*(enabled|disabled)/i, thinkingBlock);
  }
  if (!source) return `${DEEPSEEK_STRUCTURED_BODY_PARAMS_BASE}\n\n${thinkingBlock}`;
  return `${source}\n\n${thinkingBlock}`;
}

export function applyThinkingModeToDraft(draft: ApiPresetDraft, mode: ThinkingMode): void {
  draft.bodyParams = applyThinkingModeToBodyParams(draft.bodyParams, mode);
  draft.includeReasoning = mode === 'enabled';
}

/** 一键写入 DeepSeek 结构化 JSON 输出推荐参数 */
export function applyDeepSeekStructuredTemplate(
  draft: ApiPresetDraft,
  options?: { cotEnabled?: boolean },
): void {
  const cotEnabled = options?.cotEnabled ?? false;
  draft.bodyParams = buildDeepSeekBodyParams(cotEnabled);
  draft.excludeBodyParams = DEEPSEEK_STRUCTURED_EXCLUDE_BODY_PARAMS;
  draft.customPromptPostProcessing = 'strict';
  draft.includeReasoning = cotEnabled;
  draft.reasoningEffort = 'medium';
}

export const DEEPSEEK_STRUCTURED_TEMPLATE_HINT =
  'DeepSeek 结构化输出：已设置 json_object、thinking disabled、strict 后处理；prompt 须含 json 字样。';
