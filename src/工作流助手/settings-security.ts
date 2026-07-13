import type { ApiConfig, ScriptSettings } from './tasks/schema';

export function redactRequestHeaders(headers: string): string {
  return String(headers || '')
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      const lower = trimmed.toLowerCase();
      return !lower.startsWith('authorization:') && !lower.includes('bearer ');
    })
    .join('\n');
}

export function redactApiConfig(cfg: ApiConfig): ApiConfig {
  return {
    ...cfg,
    apiKey: '',
    requestHeaders: redactRequestHeaders(cfg.requestHeaders || ''),
  };
}

/** 分享导出 / 外部 API：剥离 API 凭据，保留 url/model/name 与任务 recommendedModel */
export function redactScriptSettingsForShare(settings: ScriptSettings): ScriptSettings {
  const cloned = _.cloneDeep(settings);
  cloned.apiConfig = redactApiConfig(cloned.apiConfig);
  cloned.apiPresets = cloned.apiPresets.map(preset => ({
    ...preset,
    apiConfig: redactApiConfig(preset.apiConfig),
  }));
  return cloned;
}

export const sanitizeSettingsForExternalApi = redactScriptSettingsForShare;

export function importedSettingsHadApiConfig(imported: ScriptSettings): boolean {
  if (imported.apiPresets.length > 0) return true;
  if (String(imported.defaultTaskApiPreset || '').trim()) return true;
  if (String(imported.apiConfig?.apiKey || '').trim()) return true;
  if (String(imported.apiConfig?.url || '').trim()) return true;
  return false;
}

export function detectSecretsInImportRaw(raw: unknown): boolean {
  return walkForSecrets(raw);
}

function walkForSecrets(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === 'string') return /bearer\s+\S+/i.test(raw);
  if (Array.isArray(raw)) return raw.some(walkForSecrets);
  if (typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (obj.apiKey !== undefined && String(obj.apiKey).trim()) return true;
  if (typeof obj.requestHeaders === 'string' && /authorization\s*:/i.test(obj.requestHeaders)) return true;
  return Object.values(obj).some(walkForSecrets);
}
