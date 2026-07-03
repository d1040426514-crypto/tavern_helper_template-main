import type { ApiConfig, ApiPreset } from '../tasks/schema';

export interface ApiPresetDraft {
  name: string;
  url: string;
  apiKey: string;
  model: string;
  max_tokens: number;
  temperature: number;
  bodyParams: string;
  excludeBodyParams: string;
  requestHeaders: string;
}

export function createEmptyApiPresetDraft(): ApiPresetDraft {
  return {
    name: '',
    url: '',
    apiKey: '',
    model: '',
    max_tokens: 60000,
    temperature: 1,
    bodyParams: '',
    excludeBodyParams: '',
    requestHeaders: '',
  };
}

export function apiPresetDraftFromPreset(preset: ApiPreset): ApiPresetDraft {
  const cfg = preset.apiConfig;
  return {
    name: preset.name,
    url: cfg.url || '',
    apiKey: cfg.apiKey || '',
    model: cfg.model || '',
    max_tokens: Number(cfg.max_tokens || 60000),
    temperature: Number(cfg.temperature ?? 1),
    bodyParams: cfg.bodyParams || '',
    excludeBodyParams: cfg.excludeBodyParams || '',
    requestHeaders: cfg.requestHeaders || '',
  };
}

export function apiPresetFromDraft(draft: ApiPresetDraft): ApiPreset {
  return {
    name: draft.name.trim(),
    apiConfig: {
      url: draft.url.trim(),
      apiKey: draft.apiKey,
      model: draft.model.trim(),
      source: 'openai',
      max_tokens: Math.max(1, Math.floor(Number(draft.max_tokens) || 60000)),
      temperature: Number.isFinite(Number(draft.temperature)) ? Number(draft.temperature) : 1,
      bodyParams: draft.bodyParams || '',
      excludeBodyParams: draft.excludeBodyParams || '',
      requestHeaders: draft.requestHeaders || '',
    },
  };
}

export function presetMetaLabel(preset: ApiPreset): string {
  return preset.apiConfig.model || '自定义 API';
}

export function normalizeExcludeBodyParams(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('- ') || trimmed.startsWith('[') || trimmed.startsWith('{')) return trimmed;
  return trimmed
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(key => `- ${key}`)
    .join('\n');
}

export function buildCustomApiHeaders(apiKey: string, requestHeaders: string): string {
  let headers = apiKey ? `Authorization: Bearer ${apiKey}` : '';
  const extra = requestHeaders.trim();
  if (extra) headers = headers ? `${headers}\n${extra}` : extra;
  return headers;
}

export function hasApiBodyExtras(apiConfig: ApiConfig): boolean {
  return Boolean(
    apiConfig.bodyParams?.trim() ||
      apiConfig.excludeBodyParams?.trim() ||
      apiConfig.requestHeaders?.trim(),
  );
}

export function buildCustomApiFromConfig(apiConfig: ApiConfig): CustomApiConfig {
  const custom_api: CustomApiConfig = {};
  if (apiConfig.proxy_preset) custom_api.proxy_preset = apiConfig.proxy_preset;
  if (apiConfig.url) custom_api.apiurl = apiConfig.url;
  if (apiConfig.apiKey) custom_api.key = apiConfig.apiKey;
  if (apiConfig.model) custom_api.model = apiConfig.model;
  if (apiConfig.source) custom_api.source = apiConfig.source;
  if (apiConfig.max_tokens != null) custom_api.max_tokens = apiConfig.max_tokens;
  if (apiConfig.temperature != null) custom_api.temperature = apiConfig.temperature;
  return custom_api;
}

export function omitPromptLogName<T extends { name?: string }>(message: T): Omit<T, 'name'> {
  const { name: _omit, ...rest } = message;
  return rest;
}

export function omitPromptLogNames<T extends { name?: string }>(messages: T[]): Omit<T, 'name'>[] {
  return messages.map(omitPromptLogName);
}

export function buildChatCompletionPayload(
  messages: { role: string; content: string; name?: string }[],
  apiConfig: ApiConfig,
): Record<string, unknown> {
  const model = (apiConfig.model || '').replace(/^models\//, '');
  return {
    messages: omitPromptLogNames(messages),
    model,
    max_tokens: apiConfig.max_tokens ?? 60000,
    temperature: apiConfig.temperature ?? 1,
    top_p: 0.95,
    stream: false,
    chat_completion_source: 'custom',
    include_reasoning: false,
    reasoning_effort: 'medium',
    enable_web_search: false,
    request_images: false,
    custom_prompt_post_processing: 'none',
    reverse_proxy: apiConfig.url,
    proxy_password: '',
    custom_url: apiConfig.url,
    custom_include_headers: buildCustomApiHeaders(apiConfig.apiKey, apiConfig.requestHeaders || ''),
    custom_include_body: apiConfig.bodyParams || '',
    custom_exclude_body: normalizeExcludeBodyParams(apiConfig.excludeBodyParams || ''),
  };
}
