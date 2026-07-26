/**
 * 聊天快照激活时，运行时任务变更只写快照，不得污染全局 tasks / 活动预设。
 * 非快照模式才写回全局。
 */
export function shouldWriteRuntimeTasksToGlobal(chatOverrideActive: boolean): boolean {
  return !chatOverrideActive;
}
