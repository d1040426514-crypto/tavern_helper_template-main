import { extractBalancedJsonSlice, parseJsonPatchArrayLenient } from '@util/common';
import JSON5 from 'json5';
import { jsonrepair } from 'jsonrepair';

import type { AddonPatchFailedFragment } from './patch-log';
import type { MvuJsonPatchOp, PatchIssue } from './patch';

function snippet(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

function keepSnippet(text: string, max = 4000): string {
  const trimmed = String(text || '').trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 形态校验：避免整段 jsonrepair 造出的伪 op 静默通过 */
export function isLikelyPatchOp(value: unknown): value is MvuJsonPatchOp {
  if (!isPlainObject(value) || typeof value.op !== 'string') return false;
  const op = value.op;
  if (op === 'remove') return typeof value.path === 'string';
  if (op === 'move') return typeof value.from === 'string' && typeof value.to === 'string';
  if (op === 'replace' || op === 'delta' || op === 'insert') {
    return typeof value.path === 'string' && 'value' in value;
  }
  return false;
}

function filterValidOps(parsed: unknown[]): {
  ops: MvuJsonPatchOp[];
  issues: PatchIssue[];
  failedFragments: AddonPatchFailedFragment[];
} {
  const ops: MvuJsonPatchOp[] = [];
  const issues: PatchIssue[] = [];
  const failedFragments: AddonPatchFailedFragment[] = [];
  parsed.forEach((item, index) => {
    if (isLikelyPatchOp(item)) {
      ops.push(item);
      return;
    }
    const message = `第 ${index + 1} 条不是合法 patch op: ${snippet(JSON.stringify(item) ?? String(item))}`;
    issues.push({ kind: 'parse', message });
    failedFragments.push({
      index: index + 1,
      snippet: keepSnippet(JSON.stringify(item, null, 2) ?? String(item)),
      message,
    });
  });
  return { ops, issues, failedFragments };
}

function tryParseOpSlice(slice: string): { ok: true; repaired: boolean } | { ok: false } {
  try {
    JSON.parse(slice);
    return { ok: true, repaired: false };
  } catch {
    try {
      JSON.parse(jsonrepair(slice));
      return { ok: true, repaired: true };
    } catch {
      return { ok: false };
    }
  }
}

/** 按出现顺序收集无法解析的 op 原文 */
function collectUnparseableOpFragments(patchArrayText: string): AddonPatchFailedFragment[] {
  const text = String(patchArrayText || '').trim();
  if (!text.startsWith('[')) return [];
  const fragments: AddonPatchFailedFragment[] = [];
  let opIndex = 0;
  let i = 1;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i]!)) i++;
    if (i >= text.length || text[i] === ']') break;
    if (text[i] !== '{') {
      const next = text.slice(i).search(/\{\s*"op"\s*:/);
      if (next < 0) break;
      i += next;
      continue;
    }
    opIndex += 1;
    try {
      const slice = extractBalancedJsonSlice(text, i);
      if (!tryParseOpSlice(slice).ok) {
        const message = `第 ${opIndex} 条 op 无法修复: ${snippet(slice)}`;
        fragments.push({ index: opIndex, snippet: keepSnippet(slice), message });
      }
      i += slice.length;
    } catch {
      const roughEnd = Math.min(i + 500, text.length);
      const slice = text.slice(i, roughEnd);
      const message = `第 ${opIndex} 条 op 括号不匹配，已跳过: ${snippet(slice)}`;
      fragments.push({ index: opIndex, snippet: keepSnippet(slice), message });
      const next = text.slice(i + 1).search(/\{\s*"op"\s*:/);
      if (next < 0) break;
      i = i + 1 + next;
    }
  }
  return fragments;
}

function tryParseArrayStrict(trimmed: string): unknown[] | null {
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    try {
      // eslint-disable-next-line import-x/no-named-as-default-member
      const parsed = JSON5.parse(trimmed);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

export type ParseJsonPatchResult = {
  ops: MvuJsonPatchOp[];
  issues: PatchIssue[];
  failedFragments: AddonPatchFailedFragment[];
};

/**
 * 解析 AddonJSONPatch 数组文本。
 * 先严格 JSON/JSON5；失败再逐条 parse/jsonrepair。
 * 不用整段 jsonrepair，以免静默捏造伪 op。
 */
export function parseJsonPatchOpsWithIssues(raw: string): ParseJsonPatchResult {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { ops: [], issues: [], failedFragments: [] };
  }

  const strictArray = tryParseArrayStrict(trimmed);
  if (strictArray) {
    return filterValidOps(strictArray);
  }

  const { ops: rawOps, skipped, repaired } = parseJsonPatchArrayLenient(trimmed, { repairOp: true });
  const { ops, issues, failedFragments } = filterValidOps(rawOps);

  if (repaired > 0) {
    issues.unshift({
      kind: 'heal',
      message: `已对 ${repaired} 条残缺 patch op 做语法修复`,
    });
  }

  const skipFragments = collectUnparseableOpFragments(trimmed);
  for (const frag of skipFragments) {
    issues.push({ kind: 'parse', message: frag.message });
    failedFragments.push(frag);
  }

  if (ops.length === 0 && issues.every(i => i.kind !== 'parse' || !i.message.includes('无法解析出任何'))) {
    issues.push({
      kind: 'parse',
      message: 'AddonJSONPatch 无法解析出任何有效操作',
    });
  } else if (
    ops.length > 0 &&
    skipFragments.length === 0 &&
    skipped > 0 &&
    failedFragments.length === 0
  ) {
    issues.push({
      kind: 'parse',
      message: `跳过 ${skipped} 条无法修复的 patch op`,
    });
  } else if (
    ops.length > 0 &&
    repaired === 0 &&
    skipFragments.length === 0 &&
    issues.every(i => i.kind !== 'heal')
  ) {
    issues.push({
      kind: 'heal',
      message: 'AddonJSONPatch 整段非法，已按单条 op 容错解析',
    });
  }

  return { ops, issues, failedFragments };
}
