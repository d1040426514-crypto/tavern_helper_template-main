import { readChatTaskScope, isChatOverrideActive } from './chat-task-scope';
import { ScriptSettingsSchema, type ScriptSettings } from './schema';

export function resolveEffectiveSettings(base: ScriptSettings): ScriptSettings {
  const scope = readChatTaskScope();
  if (!isChatOverrideActive(scope) || !scope?.snapshot) {
    return base;
  }
  const s = _.cloneDeep(base);
  const snap = scope.snapshot;
  s.tasks = _.cloneDeep(snap.tasks);
  s.finalInjectTemplate = snap.finalInjectTemplate;
  s.tagVariableInjectTemplate = snap.tagVariableInjectTemplate;
  s.chatExtractTags = _.cloneDeep(snap.chatExtractTags ?? { user: [], assistant: [] });
  s.contextTurnCount = snap.contextTurnCount;
  s.contextExtractRules = _.cloneDeep(snap.contextExtractRules);
  s.contextExcludeRules = _.cloneDeep(snap.contextExcludeRules);
  s.plotWorldbookConfig = _.cloneDeep(snap.plotWorldbookConfig);
  s.taskPlotWorldbookOverridesEnabled = snap.taskPlotWorldbookOverridesEnabled ?? false;
  s.taskContextOverridesEnabled = snap.taskContextOverridesEnabled ?? false;
  return ScriptSettingsSchema.parse(s);
}
