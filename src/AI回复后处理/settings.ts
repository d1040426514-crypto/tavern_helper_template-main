import { getDefaultSettingsPartial } from './tasks/example-presets';
import { normalizeContextTagRules } from './tasks/context-tags';
import { migrateImportedPreset } from './tasks/import-preset-migrate';
import {
  PostProcessPresetSchema,
  ScriptSettingsSchema,
  type PostProcessPreset,
  type ScriptSettings,
} from './tasks/schema';

function loadRawSettings(): Record<string, unknown> {
  try {
    return getVariables({ type: 'script', script_id: getScriptId() }) ?? {};
  } catch {
    return {};
  }
}

function migrateSettingsRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...raw };
  const legacyRules = merged.contextExcludeRules;
  const hasExtract = Array.isArray(merged.contextExtractRules) && merged.contextExtractRules.length > 0;

  if (!hasExtract && Array.isArray(legacyRules) && legacyRules.length > 0) {
    const isLegacy = legacyRules.some(
      r => r && typeof r === 'object' && 'tag' in r && !('start' in r),
    );
    if (isLegacy) {
      const extract: { start: string; end: string }[] = [];
      const exclude: { start: string; end: string }[] = [];
      for (const r of legacyRules) {
        if (!r || typeof r !== 'object' || !('tag' in r)) continue;
        const tag = String((r as { tag: string }).tag).replace(/[<>]/g, '');
        const rule = { start: `<${tag}>`, end: `</${tag}>` };
        if ((r as { mode?: string }).mode === 'extract') extract.push(rule);
        else exclude.push(rule);
      }
      merged.contextExtractRules = extract;
      merged.contextExcludeRules = exclude;
    }
  }

  merged.contextExtractRules = normalizeContextTagRules(merged.contextExtractRules);
  merged.contextExcludeRules = normalizeContextTagRules(merged.contextExcludeRules);

  delete merged.apiMode;
  delete merged.tavernProfile;

  if (merged.apiConfig && typeof merged.apiConfig === 'object') {
    const cfg = { ...(merged.apiConfig as Record<string, unknown>) };
    delete cfg.useMainApi;
    merged.apiConfig = cfg;
  }

  if (Array.isArray(merged.apiPresets)) {
    merged.apiPresets = merged.apiPresets.map(p => {
      if (!p || typeof p !== 'object') return p;
      const item = p as Record<string, unknown>;
      const rawCfg =
        typeof item.apiConfig === 'object' && item.apiConfig ? (item.apiConfig as Record<string, unknown>) : {};
      const { useMainApi: _omit, ...restCfg } = rawCfg;
      return {
        name: item.name,
        apiConfig: {
          ...restCfg,
          bodyParams: restCfg.bodyParams ?? '',
          excludeBodyParams: restCfg.excludeBodyParams ?? '',
          requestHeaders: restCfg.requestHeaders ?? '',
        },
      };
    });
  }

  if (!merged.defaultApiPresetName && typeof merged.defaultTaskApiPreset === 'string') {
    merged.defaultApiPresetName = merged.defaultTaskApiPreset;
  }

  const presets = merged.apiPresets;
  const apiConfig = merged.apiConfig;
  if (Array.isArray(presets) && presets.length === 0 && apiConfig && typeof apiConfig === 'object') {
    const cfg = apiConfig as Record<string, unknown>;
    const { useMainApi: _omit, ...restCfg } = cfg;
    if (String(restCfg.url || '').trim() || String(restCfg.model || '').trim()) {
      const name = '默认';
      merged.apiPresets = [{ name, apiConfig: restCfg }];
      merged.defaultApiPresetName = name;
      merged.activeApiPresetName = name;
      merged.defaultTaskApiPreset = name;
    }
  }

  return merged;
}

export function loadSettings(): ScriptSettings {
  const defaults = getDefaultSettingsPartial();
  try {
    const raw = loadRawSettings();
    const merged = migrateSettingsRaw({ ...defaults, ...raw });
    const migrated = migrateImportedPreset(merged) as Record<string, unknown>;
    return ScriptSettingsSchema.parse(migrated);
  } catch (error) {
    console.error('[AI回复后处理] 设置解析失败，已回退默认配置:', error);
    return ScriptSettingsSchema.parse(defaults);
  }
}

export function saveSettings(settings: ScriptSettings): void {
  insertOrAssignVariables(_.cloneDeep(settings), { type: 'script', script_id: getScriptId() });
}

export const useSettingsStore = defineStore('ai-post-process-settings', () => {
  const settings = ref<ScriptSettings>(loadSettings());

  function persist() {
    saveSettings(settings.value);
  }

  function reload() {
    settings.value = loadSettings();
  }

  function buildPresetFromCurrent(name: string): PostProcessPreset {
    const s = settings.value;
    return {
      name,
      tasks: _.cloneDeep(s.tasks),
      customVariables: _.cloneDeep(s.customVariables),
      finalInjectTemplate: s.finalInjectTemplate,
      tagVariableInjectTemplate: s.tagVariableInjectTemplate,
      contextTurnCount: s.contextTurnCount,
      contextExtractRules: _.cloneDeep(s.contextExtractRules),
      contextExcludeRules: _.cloneDeep(s.contextExcludeRules),
      plotWorldbookConfig: _.cloneDeep(s.plotWorldbookConfig),
    };
  }

  function saveActivePreset(): boolean {
    const name = settings.value.activePresetName.trim();
    if (!name) return false;
    const preset = buildPresetFromCurrent(name);
    const idx = settings.value.presets.findIndex(p => p.name === name);
    if (idx >= 0) settings.value.presets[idx] = preset;
    else settings.value.presets.push(preset);
    persist();
    return true;
  }

  function saveAsNewPreset(newName: string): string | null {
    const name = newName.trim();
    if (!name) return null;
    if (settings.value.presets.some(p => p.name === name)) return null;
    return addOrUpdatePreset(buildPresetFromCurrent(name));
  }

  function applyPreset(presetName: string) {
    const preset = settings.value.presets.find(p => p.name === presetName);
    if (!preset) return;
    settings.value.activePresetName = presetName;
    settings.value.tasks = _.cloneDeep(preset.tasks);
    settings.value.customVariables = _.cloneDeep(preset.customVariables);
    settings.value.finalInjectTemplate = preset.finalInjectTemplate;
    settings.value.tagVariableInjectTemplate = preset.tagVariableInjectTemplate;
    settings.value.contextTurnCount = preset.contextTurnCount;
    settings.value.contextExtractRules = _.cloneDeep(preset.contextExtractRules);
    settings.value.contextExcludeRules = _.cloneDeep(preset.contextExcludeRules);
    settings.value.plotWorldbookConfig = _.cloneDeep(preset.plotWorldbookConfig);
    persist();
  }

  function addOrUpdatePreset(preset: PostProcessPreset): string {
    const cloned = _.cloneDeep(preset);
    const idx = settings.value.presets.findIndex(p => p.name === cloned.name);
    if (idx >= 0) settings.value.presets[idx] = cloned;
    else settings.value.presets.push(cloned);
    applyPreset(cloned.name);
    return cloned.name;
  }

  function presetNameFromFileName(fileName?: string): string {
    const base = fileName?.replace(/\.json$/i, '').trim();
    return base || `导入预设-${new Date().toLocaleString('zh-CN')}`;
  }

  function importPresetFromJson(raw: unknown, fileName?: string): string {
    const migrated = migrateImportedPreset(raw);
    const presetOnly = PostProcessPresetSchema.safeParse(migrated);
    if (presetOnly.success) {
      return addOrUpdatePreset(presetOnly.data);
    }

    const fullSettings = ScriptSettingsSchema.safeParse(migrated);
    if (fullSettings.success) {
      const s = fullSettings.data;
      const name = s.activePresetName || presetNameFromFileName(fileName);
      const preset: PostProcessPreset = {
        name,
        tasks: s.tasks,
        customVariables: s.customVariables,
        finalInjectTemplate: s.finalInjectTemplate,
        tagVariableInjectTemplate: s.tagVariableInjectTemplate,
        contextTurnCount: s.contextTurnCount,
        contextExtractRules: s.contextExtractRules,
        contextExcludeRules: s.contextExcludeRules,
        plotWorldbookConfig: s.plotWorldbookConfig,
      };

      if (s.apiPresets.length) {
        for (const apiPreset of s.apiPresets) {
          const idx = settings.value.apiPresets.findIndex(p => p.name === apiPreset.name);
          if (idx >= 0) settings.value.apiPresets[idx] = _.cloneDeep(apiPreset);
          else settings.value.apiPresets.push(_.cloneDeep(apiPreset));
        }
      }
      if (s.defaultTaskApiPreset) {
        settings.value.defaultTaskApiPreset = s.defaultTaskApiPreset;
      }

      return addOrUpdatePreset(preset);
    }

    throw new Error('无法识别的预设 JSON 格式（需为预设对象或完整设置导出文件）');
  }

  watchEffect(() => {
    try {
      saveSettings(settings.value);
    } catch (error) {
      console.error('[AI回复后处理] 自动保存设置失败:', error);
    }
  });

  return { settings, persist, reload, applyPreset, importPresetFromJson, saveActivePreset, saveAsNewPreset };
});
