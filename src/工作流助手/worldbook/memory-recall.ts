import { isChronicleMemoryWorldbookEntry, normalizeWorldbookComment } from './blocked';
import { processTemplateText } from '../tasks/template-process';
import { resolveBookNames } from './content';
import type { PlotWorldbookConfig } from '../tasks/schema';

import type { WorldbookEntry } from '@types/function/worldbook';

const AM_CODE_RE = /\bAM(\d{4})\b/i;

export function extractAmCodeNumber(text: string): number | null {
  const m = String(text || '').match(AM_CODE_RE);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

export function extractAmCodeFromEntry(entry: WorldbookEntry): number | null {
  const keys = entry.strategy?.keys ?? [];
  for (const key of keys) {
    const fromKey = extractAmCodeNumber(String(key));
    if (fromKey != null) return fromKey;
  }
  return extractAmCodeNumber(entry.name || '');
}

export type ChronicleMemoryCandidate = {
  entry: WorldbookEntry;
  bookName: string;
  am: number;
};

/** 按 AM 降序取最近 N 条，再升序排列输出（时间正序） */
export function selectRecentChronicleMemoryEntries(
  candidates: ChronicleMemoryCandidate[],
  recentCount: number,
): ChronicleMemoryCandidate[] {
  const n = Math.max(0, Math.floor(Number(recentCount) || 0));
  if (n <= 0 || candidates.length === 0) return [];
  const sortedDesc = [...candidates].sort((a, b) => b.am - a.am || a.entry.uid - b.entry.uid);
  const taken = sortedDesc.slice(0, n);
  return taken.sort((a, b) => a.am - b.am || a.entry.uid - b.entry.uid);
}

export function wrapMemoryRecallContent(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return `\n<记忆回溯>\n${trimmed}\n</记忆回溯>\n`;
}

async function formatEntries(entries: WorldbookEntry[], messageId: number): Promise<string> {
  const parts: string[] = [];
  for (const entry of entries) {
    const title = await processTemplateText(entry.name || 'Entry', messageId, { source: 'world_info' });
    const content = await processTemplateText(entry.content || '', messageId, { source: 'world_info' });
    if (!title && !content) continue;
    parts.push(`# ${title || 'Entry'}\n${content}`);
  }
  return parts.join('\n\n');
}

/** $6：最近 N 条 AM 纪要世界书条目，包 <记忆回溯> */
export async function getMemoryRecallContentForPostProcess(
  config: PlotWorldbookConfig,
  recentCount: number,
  messageId: number,
): Promise<string> {
  const bookNames = await resolveBookNames(config);
  if (bookNames.length === 0) return '';

  const candidates: ChronicleMemoryCandidate[] = [];
  for (const bookName of bookNames) {
    try {
      const entries = await getWorldbook(bookName);
      for (const entry of entries) {
        if (!entry.enabled) continue;
        const normalized = normalizeWorldbookComment(entry.name);
        if (!isChronicleMemoryWorldbookEntry(normalized)) continue;
        const am = extractAmCodeFromEntry(entry);
        if (am == null) continue;
        candidates.push({ entry, bookName, am });
      }
    } catch {
      continue;
    }
  }

  const selected = selectRecentChronicleMemoryEntries(candidates, recentCount);
  if (selected.length === 0) return '';
  const raw = await formatEntries(
    selected.map(c => c.entry),
    messageId,
  );
  return wrapMemoryRecallContent(raw);
}
