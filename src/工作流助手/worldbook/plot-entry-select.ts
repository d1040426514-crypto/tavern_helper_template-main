import { shouldShowEntryInUi } from './blocked';
import type { ChatWorldbookWriteRule } from '../tasks/schema';

import type { WorldbookEntry } from '@types/function/worldbook';

/** 剧情 $1 可选条目：UI 可见且 ST 世界书原设置中已启用（对齐 shujuku isPlotEntryAllowed_ACU） */
export function isPlotWorldbookEntrySelectable(
  entry: WorldbookEntry,
  writeRules: ChatWorldbookWriteRule[] = [],
): boolean {
  if (!entry.enabled) return false;
  return shouldShowEntryInUi({ name: entry.name }, writeRules);
}

export function selectablePlotWorldbookEntryUids(
  entries: WorldbookEntry[],
  writeRules: ChatWorldbookWriteRule[] = [],
): number[] {
  return entries.filter(e => isPlotWorldbookEntrySelectable(e, writeRules)).map(e => e.uid);
}

/** 从已保存的勾选列表中剔除 ST 未启用的条目，避免脏数据进入 $1 */
export function sanitizePlotWorldbookEnabledUids(
  entries: WorldbookEntry[],
  uids: number[],
  writeRules: ChatWorldbookWriteRule[] = [],
): number[] {
  const selectable = new Set(selectablePlotWorldbookEntryUids(entries, writeRules));
  return uids.filter(uid => selectable.has(uid));
}
