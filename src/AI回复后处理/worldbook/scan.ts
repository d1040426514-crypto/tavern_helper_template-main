import type { WorldbookEntry } from '@types/function/worldbook';

function keywordToString(keyword: string | RegExp): string {
  return typeof keyword === 'string' ? keyword.toLowerCase() : keyword.source.toLowerCase();
}

function getEntryKeywords(entry: WorldbookEntry): string[] {
  const keys = entry.strategy?.keys ?? [];
  return keys.map(keywordToString).filter(Boolean);
}

export function scanTriggeredWorldbookEntries(
  entries: WorldbookEntry[],
  baseScanText: string,
  options?: { includeConstantInBaseScan?: boolean },
): WorldbookEntry[] {
  const lowerBase = baseScanText.toLowerCase();
  const constantEntries = entries.filter(e => e.strategy?.type === 'constant' && e.enabled);
  const keywordEntries = entries.filter(e => e.strategy?.type === 'selective' && e.enabled);

  let scanBase = lowerBase;
  if (options?.includeConstantInBaseScan !== false) {
    const constantText = constantEntries
      .filter(e => !e.recursion?.prevent_outgoing)
      .map(e => e.content || '')
      .join('\n')
      .toLowerCase();
    if (constantText) scanBase = [scanBase, constantText].filter(Boolean).join('\n');
  }

  const triggered = new Set<WorldbookEntry>(constantEntries);
  let remaining = [...keywordEntries];
  const maxDepth = 10;

  for (let depth = 0; depth < maxDepth && remaining.length > 0; depth++) {
    const recursionText = Array.from(triggered)
      .filter(e => !e.recursion?.prevent_outgoing)
      .map(e => e.content)
      .join('\n')
      .toLowerCase();
    const fullSearch = `${scanBase}\n${recursionText}`;
    const nextRemaining: WorldbookEntry[] = [];
    for (const entry of remaining) {
      const keywords = getEntryKeywords(entry);
      if (keywords.length === 0) {
        nextRemaining.push(entry);
        continue;
      }
      const matched = keywords.some(kw => fullSearch.includes(kw));
      if (matched) {
        triggered.add(entry);
      } else {
        nextRemaining.push(entry);
      }
    }
    if (nextRemaining.length === remaining.length) break;
    remaining = nextRemaining;
  }

  return Array.from(triggered);
}

export function formatWorldbookEntriesRaw(entries: WorldbookEntry[]): string {
  return entries
    .map(entry => `# ${entry.name || 'Entry'}\n${entry.content || ''}`)
    .filter(Boolean)
    .join('\n\n');
}
