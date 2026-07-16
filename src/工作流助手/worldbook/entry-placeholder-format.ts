import { isDbGeneratedEntry } from './blocked';

import type { WorldbookEntry } from '@types/function/worldbook';

export function shouldOmitEntryTitleInPlaceholder(normalizedComment: string): boolean {
  return isDbGeneratedEntry(String(normalizedComment || '').trim());
}

export function stripShujukuInnerTableTitle(content: string): string {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text.startsWith('# ')) return text;
  const lines = text.split('\n');
  if (lines.length < 4) return text;
  if (!lines[2]?.trim().startsWith('|') || !lines[3]?.trim().startsWith('|')) return text;
  const tableLines: string[] = [];
  for (const line of lines.slice(2)) {
    if (!line.trim().startsWith('|')) break;
    tableLines.push(line);
  }
  if (tableLines.length >= 2) return tableLines.join('\n').trim();
  return text;
}

export function normalizePlaceholderEntryContent(
  entry: Pick<WorldbookEntry, 'content'> & { normalizedComment?: string },
  content: string,
): string {
  if (!shouldOmitEntryTitleInPlaceholder(entry.normalizedComment || '')) return content.trim();
  return stripShujukuInnerTableTitle(content);
}
