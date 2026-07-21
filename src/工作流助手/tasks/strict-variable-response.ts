import type { ApiConfig } from './schema';

export type StructuredOutputMode = 'off' | 'mvu_json_patch' | 'addon_json_patch';
export type ActiveStructuredOutputMode = Exclude<StructuredOutputMode, 'off'>;

const JSON_PATCH_RE = /<JSONPatch>\s*[\s\S]*?\s*<\/JSONPatch>/i;
const ADDON_JSON_PATCH_RE = /<AddonJSONPatch>\s*[\s\S]*?\s*<\/AddonJSONPatch>/i;

export function stripCodeFence(text: string): string {
  const trimmed = String(text || '').trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : trimmed;
}

export function tryParseJsonObject(text: string): unknown {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('回复不是合法 JSON 对象。');
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function bodyParamsHasResponseFormat(bodyParams: string): boolean {
  return /response_format\s*:/.test(String(bodyParams || ''));
}

const JSON_OBJECT_BODY_SNIPPET = `response_format:
  type: json_object`;

/** 结构化任务：preset 无 response_format 时自动注入 json_object */
export function enrichApiConfigForStructuredTask(
  apiConfig: ApiConfig,
  mode: ActiveStructuredOutputMode,
): ApiConfig {
  const next = structuredClone(apiConfig);
  if (!bodyParamsHasResponseFormat(next.bodyParams)) {
    const trimmed = next.bodyParams.trim();
    next.bodyParams = trimmed ? `${trimmed}\n${JSON_OBJECT_BODY_SNIPPET}` : JSON_OBJECT_BODY_SNIPPET;
  }
  if (next.customPromptPostProcessing !== 'strict') {
    next.customPromptPostProcessing = 'strict';
  }
  if (!next.excludeBodyParams.trim()) {
    next.excludeBodyParams = 'top_p, reasoning_effort';
  }
  void mode;
  return next;
}

export function buildStrictJsonPromptSuffix(_mode: ActiveStructuredOutputMode): string {
  return `[严格 JSON 输出]
你必须仅输出一个合法的 JSON 对象（不要使用 markdown 代码围栏，不要添加任何自然语言前缀或后缀）。本提示已包含 json 关键字以满足模型约束。

根对象结构：
{"analysis":"英文分析，不超过 80 词","patch":[...]}

其中 patch 必须是 JSON Patch (RFC 6902) 操作数组。禁止输出 XML、HTML 或 <JSONPatch>/<AddonJSONPatch> 标签。`;
}

/** @deprecated 结构化输出格式由提示词段承担，运行时不再向最后一条消息追加后缀。 */
export function appendStrictJsonPromptToMessages<T extends { role: string; content: string; name?: string }>(
  messages: T[],
  _mode: ActiveStructuredOutputMode,
): T[] {
  return messages.map(m => ({ ...m }));
}

export interface StrictVariableExtractionResult {
  ok: boolean;
  normalizedXml?: string;
  error?: string;
  retryHint?: string;
}

function normalizePatchArray(patch: unknown): string {
  if (!Array.isArray(patch)) throw new Error('patch 必须是数组。');
  return JSON.stringify(patch, null, 2);
}

function buildNormalizedVariableXml(mode: ActiveStructuredOutputMode, analysis: string, patchJson: string): string {
  const patchTag = mode === 'mvu_json_patch' ? 'JSONPatch' : 'AddonJSONPatch';
  return `<UpdateVariable>
<Analysis>${analysis.trim()}</Analysis>
<${patchTag}>
${patchJson}
</${patchTag}>
</UpdateVariable>`;
}

export function extractStrictVariableResponse(
  text: string,
  mode: ActiveStructuredOutputMode,
): StrictVariableExtractionResult {
  try {
    const parsed = tryParseJsonObject(text);
    if (!isPlainObject(parsed)) throw new Error('回复 JSON 根节点必须是对象。');

    const analysis = parsed.analysis;
    if (typeof analysis !== 'string' || !analysis.trim()) {
      throw new Error('analysis 必须是非空字符串。');
    }

    const patchJson = normalizePatchArray(parsed.patch);
    const normalizedXml = buildNormalizedVariableXml(mode, analysis, patchJson);
    return { ok: true, normalizedXml };
  } catch (error) {
    const message = error instanceof Error ? error.message : '严格 JSON 变量响应解析失败。';
    return { ok: false, error: message, retryHint: message };
  }
}

export function hasCompleteVariableXml(text: string, mode: ActiveStructuredOutputMode): boolean {
  const re = mode === 'mvu_json_patch' ? JSON_PATCH_RE : ADDON_JSON_PATCH_RE;
  return re.test(String(text || ''));
}

export function apiConfigRequiresChatCompletionPath(apiConfig: ApiConfig): boolean {
  return (
    apiConfig.customPromptPostProcessing === 'strict' ||
    Boolean(apiConfig.bodyParams?.trim()) ||
    Boolean(apiConfig.excludeBodyParams?.trim())
  );
}

export const STRUCTURED_OUTPUT_MODE_HELP = {
  intro:
    'DeepSeek 等模型易输出 markdown/思维链导致 MVU/addon 变量 XML 提取失败。开启后通过「变量输出规则」提示词段约束 JSON 格式，解析 AI 纯 JSON 并归一化为 <UpdateVariable> 包裹的 <JSONPatch> 或 <AddonJSONPatch>，再走现有注入链路。',
  apiPreset:
    '建议 API 预设使用「DeepSeek 结构化输出」模板（response_format: json_object、custom_prompt_post_processing: strict）。任务开启本模式时若 preset 无 response_format 会自动注入 json_object。',
  modes: [
    { value: 'off', title: '关闭', desc: '沿用 XML 标签输出，不做 JSON 解析。' },
    {
      value: 'mvu_json_patch',
      title: 'MVU JSON Patch',
      desc: '要求 {"analysis":"...","patch":[...]}，归一化为 <UpdateVariable><Analysis><JSONPatch>。',
    },
    {
      value: 'addon_json_patch',
      title: 'Addon JSON Patch',
      desc: '要求 {"analysis":"...","patch":[...]}，归一化为 <UpdateVariable><Analysis><AddonJSONPatch>。',
    },
  ],
  retry: 'JSON 解析失败会计入最大重试次数；若 raw 已含完整 XML 内层标签则回退走现有提取。',
};
