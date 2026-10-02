import type { PostProcessTask, ScriptSettings } from '../tasks/schema';

type NamedTask = Pick<PostProcessTask, 'apiPresetName' | 'apiPresetFallbackNames'>;

function replacePresetName(current: string | undefined, from: string, to: string): string {
  return String(current || '').trim() === from ? to : String(current || '');
}

/** 改任务主预设与备用列表。to 为空表示删除该引用。 */
export function rewriteApiPresetNameInTaskList(tasks: NamedTask[], from: string, to: string): void {
  const oldName = from.trim();
  const newName = to.trim();
  if (!oldName || oldName === newName) return;
  for (const task of tasks) {
    if (String(task.apiPresetName || '').trim() === oldName) task.apiPresetName = newName;
    const fallbacks = task.apiPresetFallbackNames ?? [];
    task.apiPresetFallbackNames = fallbacks
      .map(name => (String(name || '').trim() === oldName ? newName : name))
      .filter(name => String(name || '').trim());
  }
}

/**
 * 同步任务、工作流预设、覆盖表、默认名、当前预设和聊天绑定。
 * 不改 apiPresets 数组本身；预设对象的改名由调用方先完成。
 */
export function rewriteApiPresetReferences(settings: ScriptSettings, from: string, to: string): void {
  const oldName = from.trim();
  const newName = to.trim();
  if (!oldName || oldName === newName) return;

  rewriteApiPresetNameInTaskList(settings.tasks, oldName, newName);
  for (const preset of settings.presets) {
    rewriteApiPresetNameInTaskList(preset.tasks, oldName, newName);
  }

  const overrides = settings.taskApiPresetOverridesById;
  for (const taskId of Object.keys(overrides)) {
    if (String(overrides[taskId] || '').trim() !== oldName) continue;
    if (newName) overrides[taskId] = newName;
    else delete overrides[taskId];
  }

  settings.defaultApiPresetName = replacePresetName(settings.defaultApiPresetName, oldName, newName);
  settings.defaultTaskApiPreset = replacePresetName(settings.defaultTaskApiPreset, oldName, newName);
  settings.activeApiPresetName = replacePresetName(settings.activeApiPresetName, oldName, newName);

  for (const [chatKey, binding] of Object.entries(settings.apiPresetBindingsByChat)) {
    if (String(binding?.presetName || '').trim() !== oldName) continue;
    if (newName) binding.presetName = newName;
    else delete settings.apiPresetBindingsByChat[chatKey];
  }
}
