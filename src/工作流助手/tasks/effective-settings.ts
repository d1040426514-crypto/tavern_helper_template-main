import { readChatTaskScope, isChatOverrideActive } from './chat-task-scope';
import { applyReplicaFamilyCleanupRuntime } from './replica-family-cleanup';
import {
  ScriptSettingsSchema,
  type ChatTaskScopeState,
  type PostProcessPreset,
  type ScriptSettings,
} from './schema';

/** 将预设字段叠到 settings 副本上（不改 name/activePresetName） */
export function applyPresetFieldsToSettings(target: ScriptSettings, preset: PostProcessPreset): void {
  target.tasks = _.cloneDeep(preset.tasks);
  target.finalInjectTemplate = preset.finalInjectTemplate;
  target.userInputEndInjectTemplate = preset.userInputEndInjectTemplate ?? '';
  target.tagVariableInjectTemplate = preset.tagVariableInjectTemplate;
  target.chatExtractTags = _.cloneDeep(preset.chatExtractTags ?? { user: [], assistant: [] });
  target.chatBodyTagReplaceRules = _.cloneDeep(preset.chatBodyTagReplaceRules ?? []);
  target.chatWorldbookWriteRules = _.cloneDeep(preset.chatWorldbookWriteRules ?? []);
  target.contextTurnCount = preset.contextTurnCount;
  target.contextExtractRules = _.cloneDeep(preset.contextExtractRules);
  target.contextExcludeRules = _.cloneDeep(preset.contextExcludeRules);
  target.plotWorldbookConfig = _.cloneDeep(preset.plotWorldbookConfig);
  target.taskPlotWorldbookOverridesEnabled = preset.taskPlotWorldbookOverridesEnabled ?? false;
  target.taskContextOverridesEnabled = preset.taskContextOverridesEnabled ?? false;
  target.memoryRecallRecentCount = preset.memoryRecallRecentCount ?? 10;
}

function overlayReplicaFamilyCleanupRuntime(
  target: ScriptSettings,
  scope: ChatTaskScopeState | null,
): void {
  if (!target.replicaFamilyCleanup) return;
  const runtime =
    scope && isChatOverrideActive(scope) ? scope.replicaFamilyCleanupRuntime : undefined;
  applyReplicaFamilyCleanupRuntime(target.replicaFamilyCleanup, runtime);
}

export function resolveEffectiveSettings(base: ScriptSettings): ScriptSettings {
  const scope = readChatTaskScope();
  if (!isChatOverrideActive(scope) || !scope?.snapshot) {
    overlayReplicaFamilyCleanupRuntime(base, null);
    return base;
  }

  const s = _.cloneDeep(base);

  if (scope.activeView === 'global') {
    const name = scope.boundGlobalPresetName?.trim() ?? '';
    const preset = name ? base.presets.find(p => p.name === name) : undefined;
    if (preset) {
      applyPresetFieldsToSettings(s, preset);
      overlayReplicaFamilyCleanupRuntime(s, scope);
      return ScriptSettingsSchema.parse(s);
    }
    // 绑定预设缺失：回退 snapshot（纠正 scope 由 repairChatScopeBoundPreset / UI 负责）
  }

  applyPresetFieldsToSettings(s, scope.snapshot);
  overlayReplicaFamilyCleanupRuntime(s, scope);
  return ScriptSettingsSchema.parse(s);
}
