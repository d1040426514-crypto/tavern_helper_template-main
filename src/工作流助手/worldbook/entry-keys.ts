import { parseCommaSeparatedList } from '../tasks/comma-separated';
import type { WorldbookWriteAppliedEntry } from './write-sync';

/** 逗号/空白拆分、trim、去空 */
export function normalizeKeywordList(raw: string | string[] | undefined | null): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map(s => String(s).trim()).filter(Boolean);
  }
  return parseCommaSeparatedList(String(raw));
}

/** 默认 keys ∪ 额外 keys，保序去重 */
export function mergeEntryKeys(defaultKeys: string[], extraKeys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of [...normalizeKeywordList(defaultKeys), ...normalizeKeywordList(extraKeys)]) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** 从最终 keys 中抽出不属于默认集合的部分（回填旧账本） */
export function diffExtraKeys(finalKeys: string[], defaultKeys: string[]): string[] {
  const defaults = new Set(normalizeKeywordList(defaultKeys));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of normalizeKeywordList(finalKeys)) {
    if (defaults.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** 从 applied 账本读取额外关键词；仅信任显式 extraKeys，缺失视为 []（不从 strategy.keys 猜测） */
export function resolveAppliedExtraKeys(
  applied: WorldbookWriteAppliedEntry | undefined | null,
): string[] {
  if (!applied || !Array.isArray(applied.extraKeys)) return [];
  return normalizeKeywordList(applied.extraKeys);
}
