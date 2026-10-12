/** 脚本保存：其余字段仍合并。任务列表、摘取标签、预设槽和清理配置整份替换，避免按索引合并把旧副本留在后面。 */
export function mergePersistedScriptSettings<T extends Record<string, unknown>>(
  current: T,
  persisted: T,
): T {
  const next = _.merge({}, current, persisted) as T;
  const cleanup = persisted.replicaFamilyCleanup;
  if (cleanup && typeof cleanup === 'object') {
    (next as { replicaFamilyCleanup?: unknown }).replicaFamilyCleanup = _.cloneDeep(cleanup);
  }
  if (Array.isArray(persisted.tasks)) {
    (next as { tasks?: unknown }).tasks = _.cloneDeep(persisted.tasks);
  }
  if (persisted.chatExtractTags && typeof persisted.chatExtractTags === 'object') {
    (next as { chatExtractTags?: unknown }).chatExtractTags = _.cloneDeep(persisted.chatExtractTags);
  }
  if (Array.isArray(persisted.presets)) {
    (next as { presets?: unknown }).presets = _.cloneDeep(persisted.presets);
  }
  return next;
}
