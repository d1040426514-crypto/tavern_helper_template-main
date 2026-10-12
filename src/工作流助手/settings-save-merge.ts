/** 脚本保存：其余字段仍合并，清理配置整份替换，空计数才能盖掉旧键。 */
export function mergePersistedScriptSettings<T extends Record<string, unknown>>(
  current: T,
  persisted: T,
): T {
  const next = _.merge({}, current, persisted) as T;
  const cleanup = persisted.replicaFamilyCleanup;
  if (cleanup && typeof cleanup === 'object') {
    (next as { replicaFamilyCleanup?: unknown }).replicaFamilyCleanup = _.cloneDeep(cleanup);
  }
  return next;
}
