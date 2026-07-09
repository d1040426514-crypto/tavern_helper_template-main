import {
  isDbGeneratedEntry,
  isEntryBlocked,
  isOutlineOrSummaryIndexEntry,
  normalizeWorldbookComment,
} from './blocked';
import { isPlotWorldbookEntrySelectable } from './plot-entry-select';
import { applyExcludeRulesToText } from '../tasks/context-tags';
import { processTemplateText } from '../tasks/template-process';
import { sortPlotWorldbookEntries } from './entry-order';
import { scanTriggeredWorldbookEntries } from './scan';
import type { ContextTagRule, PlotWorldbookConfig } from '../tasks/schema';

import type { WorldbookEntry } from '@types/function/worldbook';

type DecoratedEntry = WorldbookEntry & {
  bookName: string;
  normalizedComment: string;
  placeholderOriginalIndex: number;
};

/** 条目宏/EJS 完成后：排除规则 + worldbook_context 包装（对齐 shujuku 剧情 $1 替换） */
export function finalizePlotWorldbookPlaceholderContent(
  raw: string,
  excludeRules: ContextTagRule[],
): string {
  const filtered = applyExcludeRulesToText(raw, excludeRules).trim();
  if (!filtered) return '';
  return `\n<worldbook_context>\n${filtered}\n</worldbook_context>\n`;
}

async function resolveBookNames(config: PlotWorldbookConfig): Promise<string[]> {
  if (config.source === 'manual') {
    return [...new Set(config.manualSelection.filter(Boolean))];
  }
  try {
    const charBooks = getCharWorldbookNames('current');
    const names: string[] = [];
    if (charBooks.primary) names.push(charBooks.primary);
    names.push(...charBooks.additional);
    return [...new Set(names.filter(Boolean))];
  } catch {
    return [];
  }
}

function decorateEntry(
  entry: WorldbookEntry,
  bookName: string,
  placeholderOriginalIndex: number,
): DecoratedEntry {
  const normalizedComment = normalizeWorldbookComment(entry.name);
  return { ...entry, bookName, normalizedComment, placeholderOriginalIndex };
}

function isSelectedEntry(entry: DecoratedEntry, config: PlotWorldbookConfig): boolean {
  const enabledMap = config.enabledEntries || {};
  const hasAnySelection = Object.keys(enabledMap).length > 0;
  if (!hasAnySelection) return true;
  if (isDbGeneratedEntry(entry.normalizedComment)) return true;
  const list = enabledMap[entry.bookName];
  if (list == null || !Array.isArray(list)) return true;
  return list.includes(entry.uid);
}

async function formatWorldbookEntries(
  entries: WorldbookEntry[],
  messageId: number,
): Promise<string> {
  const parts: string[] = [];
  for (const entry of entries) {
    const title = await processTemplateText(entry.name || 'Entry', messageId);
    const content = await processTemplateText(entry.content || '', messageId);
    if (!title && !content) continue;
    parts.push(`# ${title || 'Entry'}\n${content}`);
  }
  return parts.join('\n\n');
}

export async function getWorldbookContentForPostProcess(
  config: PlotWorldbookConfig,
  baseScanText: string,
  messageId: number,
): Promise<string> {
  const bookNames = await resolveBookNames(config);
  if (bookNames.length === 0) return '';

  const allEntries: DecoratedEntry[] = [];
  let placeholderOriginalIndex = 0;
  for (const bookName of bookNames) {
    try {
      const entries = await getWorldbook(bookName);
      for (const entry of entries) {
        const decorated = decorateEntry(entry, bookName, placeholderOriginalIndex++);
        if (isOutlineOrSummaryIndexEntry(decorated.normalizedComment)) continue;
        if (!isDbGeneratedEntry(decorated.normalizedComment) && isEntryBlocked(entry)) continue;
        if (!isDbGeneratedEntry(decorated.normalizedComment) && !isPlotWorldbookEntrySelectable(entry)) continue;
        if (!isSelectedEntry(decorated, config)) continue;
        allEntries.push(decorated);
      }
    } catch {
      continue;
    }
  }

  if (allEntries.length === 0) return '';
  const triggered = sortPlotWorldbookEntries(scanTriggeredWorldbookEntries(allEntries, baseScanText));
  return formatWorldbookEntries(triggered, messageId);
}

export { resolveBookNames };
