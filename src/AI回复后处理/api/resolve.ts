import type { ApiConfig, ApiPreset, ScriptSettings } from '../tasks/schema';

export interface ResolvedApi {
  apiConfig: ApiConfig;
}

export function findApiPreset(settings: ScriptSettings, name: string): ApiPreset | null {
  const normalized = String(name || '').trim();
  if (!normalized) return null;
  return settings.apiPresets.find(p => p.name === normalized) ?? null;
}

export function resolveApiPreset(settings: ScriptSettings, presetName: string): ApiConfig {
  return resolveApiPresetFull(settings, presetName).apiConfig;
}

export function resolveApiPresetFull(settings: ScriptSettings, presetName: string): ResolvedApi {
  const preset = findApiPreset(settings, presetName);
  if (preset) {
    return { apiConfig: preset.apiConfig };
  }
  return { apiConfig: settings.apiConfig };
}

export function resolveTaskApiPreset(settings: ScriptSettings, taskId: string, taskPresetName?: string): string {
  const override = String(settings.taskApiPresetOverridesById[taskId] || '').trim();
  if (override) return override;
  const onTask = String(taskPresetName || '').trim();
  if (onTask) return onTask;
  return String(settings.defaultTaskApiPreset || settings.defaultApiPresetName || '').trim();
}

export function getEffectiveApi(settings: ScriptSettings, taskId: string, taskPresetName?: string): ResolvedApi {
  const presetName = resolveTaskApiPreset(settings, taskId, taskPresetName);
  return resolveApiPresetFull(settings, presetName);
}

/** @deprecated 使用 getEffectiveApi */
export function getEffectiveApiConfig(
  settings: ScriptSettings,
  taskId: string,
  taskPresetName?: string,
): ApiConfig {
  return getEffectiveApi(settings, taskId, taskPresetName).apiConfig;
}
