import type { ChatWorldbookWriteRule } from '../tasks/schema';
import { isManagedWorldbookEntryName } from './write-ledger-utils';
import { WORKFLOW_HELPER_ENTRY_PREFIX } from './write-sync';

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

/** shujuku 纪要/总结世界书行条目 → 专供 $6 */
export function isChronicleMemoryWorldbookEntry(normalizedComment: string): boolean {
  return (
    normalizedComment.startsWith('总结条目') || normalizedComment.startsWith('小总结条目')
  );
}

/** 默认前缀托管条目（规范化后） */
export function isWorkflowHelperManagedEntry(normalizedComment: string): boolean {
  return normalizedComment.startsWith(WORKFLOW_HELPER_ENTRY_PREFIX);
}

/** 工作流助手托管条目（默认前缀或规则自定义 entryName）→ 专供 $2 */
export function isManagedPlotWorldbookEntry(
  nameOrNormalized: string,
  writeRules: ChatWorldbookWriteRule[] = [],
): boolean {
  const normalized = normalizeWorldbookComment(nameOrNormalized);
  if (isWorkflowHelperManagedEntry(normalized)) return true;
  if (writeRules.length > 0 && isManagedWorldbookEntryName(normalized, writeRules)) return true;
  return false;
}

/**
 * $1 扫描始终纳入：非纪要记忆的 DB 生成条目（不含 WorkflowHelper / 总结条目）。
 * 对齐 shujuku 对 isDbGenerated 的旁路，但托管与纪要记忆已拆到 $2/$6。
 */
export function isPlotDollar1AutoIncludedEntry(nameOrNormalized: string): boolean {
  const normalized = normalizeWorldbookComment(nameOrNormalized);
  if (isChronicleMemoryWorldbookEntry(normalized)) return false;
  if (isWorkflowHelperManagedEntry(normalized)) return false;
  return isDbGeneratedEntry(normalized);
}

/**
 * UI 隐藏 / 非手动勾选清单条目：DB 生成 + 工作流助手托管。
 */
export function isAutoIncludedPlotWorldbookEntry(
  nameOrNormalized: string,
  writeRules: ChatWorldbookWriteRule[] = [],
): boolean {
  const normalized = normalizeWorldbookComment(nameOrNormalized);
  if (isDbGeneratedEntry(normalized)) return true;
  return isManagedPlotWorldbookEntry(normalized, writeRules);
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

export function shouldShowEntryInUi(
  entry: { name?: string },
  writeRules: ChatWorldbookWriteRule[] = [],
): boolean {
  const normalized = normalizeWorldbookComment(entry.name || '');
  if (isOutlineOrSummaryIndexEntry(normalized)) return false;
  if (isAutoIncludedPlotWorldbookEntry(normalized, writeRules)) return false;
  if (isEntryBlocked({ name: entry.name })) return false;
  return true;
}
