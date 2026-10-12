/**
 * 脚本保存：标量仍合并。列表、映射和预设文档整份替换。
 * lodash merge 按索引合并数组、按键合并对象，删掉的规则、预设和绑定会留在旧值里。
 */
const WHOLESALE_KEYS = [
  'replicaFamilyCleanup',
  'tasks',
  'chatExtractTags',
  'presets',
  'lastRunStatus',
  'contextExtractRules',
  'contextExcludeRules',
  'chatBodyTagReplaceRules',
  'chatWorldbookWriteRules',
  'plotWorldbookConfig',
  'apiPresets',
  'apiPresetBindingsByChat',
  'taskApiPresetOverridesById',
  'scheduleState',
  'progressHudPosition',
] as const;

export function mergePersistedScriptSettings<T extends Record<string, unknown>>(
  current: T,
  persisted: T,
): T {
  const next = _.merge({}, current, persisted) as T;
  const target = next as Record<string, unknown>;
  for (const key of WHOLESALE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(persisted, key)) continue;
    const value = persisted[key];
    if (value === undefined) continue;
    target[key] = _.cloneDeep(value);
  }
  return next;
}
