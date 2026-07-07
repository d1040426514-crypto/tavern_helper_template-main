import { loadSettings, saveSettings } from '../settings';
import { isChatOverrideActive, readChatTaskScope, writeChatTaskScope } from './chat-task-scope';
import type { ScriptSettings } from './schema';

/** 将运行时副本同步、launched 等变更写回持久化存储 */
export async function persistRuntimeTaskChanges(
  baseSettings: ScriptSettings,
  effectiveSettings: ScriptSettings,
): Promise<void> {
  baseSettings.replicaFamilyCleanup = _.cloneDeep(effectiveSettings.replicaFamilyCleanup);
  const scope = readChatTaskScope();
  if (isChatOverrideActive(scope) && scope?.snapshot) {
    const nextSnapshot = {
      ...scope.snapshot,
      tasks: _.cloneDeep(effectiveSettings.tasks),
    };
    await writeChatTaskScope({
      ...scope,
      snapshot: nextSnapshot,
      updatedAt: Date.now(),
    });
    baseSettings.tasks = _.cloneDeep(effectiveSettings.tasks);
  } else {
    baseSettings.tasks = _.cloneDeep(effectiveSettings.tasks);
  }
  saveSettings(baseSettings);
}
