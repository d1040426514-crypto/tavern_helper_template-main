const BLOCKED_KEYWORDS = [
  '规则',
  '思维链',
  'cot',
  'MVU',
  'mvu',
  '变量',
  '状态',
  'Status',
  'Rule',
  'rule',
  '检定',
  '判断',
  '叙事',
  '文风',
  'InitVar',
  '格式',
];

export function normalizeWorldbookComment(comment: string): string {
  let normalized = String(comment || '').replace(/^ACU-\[[^\]]+\]-/, '');
  normalized = normalized.replace(/^外部导入-(?:[^-]+-)?/, '');
  return normalized;
}

export function isDbGeneratedEntry(normalizedComment: string): boolean {
  return (
    normalizedComment.startsWith('TavernDB-ACU-') ||
    normalizedComment.startsWith('总结条目') ||
    normalizedComment.startsWith('小总结条目') ||
    normalizedComment.startsWith('重要人物条目')
  );
}

export function isOutlineOrSummaryIndexEntry(normalizedComment: string): boolean {
  return (
    normalizedComment.startsWith('TavernDB-ACU-OutlineTable') ||
    normalizedComment.startsWith('TavernDB-ACU-CustomExport-纪要索引')
  );
}

export function isEntryBlocked(entry: { name?: string }): boolean {
  const name = entry.name || '';
  return BLOCKED_KEYWORDS.some(keyword => name.includes(keyword));
}

export function shouldShowEntryInUi(entry: { name?: string }): boolean {
  const normalized = normalizeWorldbookComment(entry.name || '');
  if (isOutlineOrSummaryIndexEntry(normalized)) return false;
  if (isDbGeneratedEntry(normalized)) return false;
  if (isEntryBlocked({ name: entry.name })) return false;
  return true;
}
