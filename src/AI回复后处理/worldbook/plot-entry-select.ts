import { shouldShowEntryInUi } from './blocked';

import type { WorldbookEntry } from '@types/function/worldbook';

/** 剧情 $1 可选条目：UI 可见且 ST 世界书原设置中已启用（对齐 shujuku isPlotEntryAllowed_ACU） */
export function isPlotWorldbookEntrySelectable(entry: WorldbookEntry): boolean {
  if (!entry.enabled) return false;
  return shouldShowEntryInUi({ name: entry.name });
}

export function selectablePlotWorldbookEntryUids(entries: WorldbookEntry[]): number[] {
  return entries.filter(isPlotWorldbookEntrySelectable).map(e => e.uid);
}

/** 从已保存的勾选列表中剔除 ST 未启用的条目，避免脏数据进入 $1 */
export function sanitizePlotWorldbookEnabledUids(
  entries: WorldbookEntry[],
  uids: number[],
): number[] {
  const selectable = new Set(selectablePlotWorldbookEntryUids(entries));
  return uids.filter(uid => selectable.has(uid));
}
