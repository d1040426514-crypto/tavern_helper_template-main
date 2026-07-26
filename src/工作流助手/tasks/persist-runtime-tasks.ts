import { saveSettings } from '../settings';
import { isChatOverrideActive, readChatTaskScope, writeChatTaskScope } from './chat-task-scope';
import { emitTasksChanged } from './events';
import { shouldWriteRuntimeTasksToGlobal } from './persist-runtime-tasks-logic';
import type { ScriptSettings } from './schema';

export { shouldWriteRuntimeTasksToGlobal } from './persist-runtime-tasks-logic';

/** 将运行时 tasks 同步进当前活动任务预设，避免清理后预设仍保留已删副本。 */
export function syncActivePresetTasksFromRuntime(settings: ScriptSettings): void {
  const name = settings.activePresetName?.trim();
  if (!name) return;
  const idx = settings.presets.findIndex(p => p.name === name);
  if (idx < 0) return;
  settings.presets[idx] = {
    ...settings.presets[idx]!,
    tasks: _.cloneDeep(settings.tasks),
  };
}

/** 将运行时副本同步、launched 等变更写回持久化存储 */
export async function persistRuntimeTaskChanges(
  baseSettings: ScriptSettings,
  effectiveSettings: ScriptSettings,
): Promise<void> {
  baseSettings.replicaFamilyCleanup = _.cloneDeep(effectiveSettings.replicaFamilyCleanup);
  const scope = readChatTaskScope();
  const chatOverride = isChatOverrideActive(scope) && !!scope?.snapshot;

  if (chatOverride) {
    // 有快照：只写 snapshot；若曾在 global 视图，写回后切回 snapshot，避免视图与数据错位
    await writeChatTaskScope({
      ...scope!,
      snapshot: {
        ...scope!.snapshot!,
        tasks: _.cloneDeep(effectiveSettings.tasks),
      },
      activeView: 'snapshot',
      boundGlobalPresetName: '',
      updatedAt: Date.now(),
    });
  } else if (shouldWriteRuntimeTasksToGlobal(chatOverride)) {
    baseSettings.tasks = _.cloneDeep(effectiveSettings.tasks);
    syncActivePresetTasksFromRuntime(baseSettings);
  }

  saveSettings(baseSettings);
  await emitTasksChanged('replace', 'api');
}
