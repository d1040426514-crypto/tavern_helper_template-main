import { parseString } from '@util/common';

/** 与 MVU 变量输出格式兼容的 JSON Patch 操作 */
export type MvuJsonPatchOp =
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'delta'; path: string; value: number }
  | { op: 'insert'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'move'; from: string; to: string };

export type PatchIssue = {
  kind: 'parse' | 'apply';
  message: string;
  op?: MvuJsonPatchOp;
};

const ADDON_JSON_PATCH_RE = /<AddonJSONPatch>\s*([\s\S]*?)\s*<\/AddonJSONPatch>/gi;

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function parseJsonPointer(path: string): string[] {
  if (!path.startsWith('/')) {
    throw new Error(`JSON Pointer 必须以 / 开头: ${path}`);
  }
  if (path === '/') {
    return [];
  }
  return path
    .slice(1)
    .split('/')
    .map(decodeJsonPointerSegment);
}

function isReadonlyPath(segments: string[]): boolean {
  return segments.some(segment => segment.startsWith('_'));
}

function getAtPath(root: unknown, segments: string[]): unknown {
  let current = root;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      if (segment === '-') {
        return undefined;
      }
      const index = Number(segment);
      current = current[index];
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

function resolveParent(root: Record<string, unknown>, segments: string[]): {
  parent: Record<string, unknown> | unknown[];
  key: string;
} {
  if (segments.length === 0) {
    throw new Error('不能对根路径执行该操作');
  }
  const parentSegments = segments.slice(0, -1);
  const key = segments[segments.length - 1]!;
  let parent: unknown = root;
  for (const segment of parentSegments) {
    if (parent === null || parent === undefined) {
      throw new Error(`路径不存在: /${segments.join('/')}`);
    }
    if (Array.isArray(parent)) {
      if (segment === '-') {
        throw new Error(`路径不存在: /${segments.join('/')}`);
      }
      parent = parent[Number(segment)];
      continue;
    }
    if (typeof parent === 'object') {
      parent = (parent as Record<string, unknown>)[segment];
      continue;
    }
    throw new Error(`路径不存在: /${segments.join('/')}`);
  }
  if (parent === null || parent === undefined || typeof parent !== 'object') {
    throw new Error(`路径不存在: /${segments.join('/')}`);
  }
  return { parent: parent as Record<string, unknown> | unknown[], key };
}

function setAtPath(root: Record<string, unknown>, segments: string[], value: unknown): void {
  if (segments.length === 0) {
    throw new Error('不能 replace 根对象');
  }
  const { parent, key } = resolveParent(root, segments);
  if (Array.isArray(parent)) {
    if (key === '-') {
      parent.push(value);
      return;
    }
    parent[Number(key)] = value;
    return;
  }
  parent[key] = value;
}

function removeAtPath(root: Record<string, unknown>, segments: string[]): void {
  const { parent, key } = resolveParent(root, segments);
  if (Array.isArray(parent)) {
    if (key === '-') {
      throw new Error('不能 remove 数组占位符 -');
    }
    parent.splice(Number(key), 1);
    return;
  }
  delete parent[key];
}

function coerceNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`delta 目标不是有效数字: ${JSON.stringify(value)}`);
  }
  return num;
}

function applyOp(root: Record<string, unknown>, op: MvuJsonPatchOp): void {
  switch (op.op) {
    case 'replace': {
      const segments = parseJsonPointer(op.path);
      if (isReadonlyPath(segments)) {
        return;
      }
      setAtPath(root, segments, op.value);
      return;
    }
    case 'delta': {
      const segments = parseJsonPointer(op.path);
      if (isReadonlyPath(segments)) {
        return;
      }
      const current = getAtPath(root, segments);
      setAtPath(root, segments, coerceNumber(current) + coerceNumber(op.value));
      return;
    }
    case 'insert': {
      const segments = parseJsonPointer(op.path);
      if (isReadonlyPath(segments)) {
        return;
      }
      const { parent, key } = resolveParent(root, segments);
      if (Array.isArray(parent)) {
        if (key === '-') {
          parent.push(op.value);
          return;
        }
        const index = Number(key);
        parent.splice(index, 0, op.value);
        return;
      }
      parent[key] = op.value;
      return;
    }
    case 'remove': {
      const segments = parseJsonPointer(op.path);
      if (isReadonlyPath(segments)) {
        return;
      }
      removeAtPath(root, segments);
      return;
    }
    case 'move': {
      const fromSegments = parseJsonPointer(op.from);
      const toSegments = parseJsonPointer(op.to);
      if (isReadonlyPath(fromSegments) || isReadonlyPath(toSegments)) {
        return;
      }
      const value = getAtPath(root, fromSegments);
      removeAtPath(root, fromSegments);
      setAtPath(root, toSegments, value);
      return;
    }
    default:
      throw new Error(`未知 patch 操作: ${JSON.stringify(op)}`);
  }
}

export function parseJsonPatchOps(raw: string): MvuJsonPatchOp[] {
  const parsed = parseString(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('AddonJSONPatch 必须是 JSON 数组');
  }
  return parsed as MvuJsonPatchOp[];
}

/** 从消息中提取所有 <AddonJSONPatch> 块并解析为 op 列表 */
export function extractAddonJsonPatchOpsWithIssues(message: string): { ops: MvuJsonPatchOp[]; issues: PatchIssue[] } {
  const ops: MvuJsonPatchOp[] = [];
  const issues: PatchIssue[] = [];
  for (const match of message.matchAll(ADDON_JSON_PATCH_RE)) {
    const patchText = match[1]?.trim();
    if (!patchText) {
      continue;
    }
    try {
      ops.push(...parseJsonPatchOps(patchText));
    } catch (error) {
      const message_text = error instanceof Error ? error.message : String(error);
      issues.push({ kind: 'parse', message: message_text });
      console.warn('[addon-mvu] AddonJSONPatch 解析失败, 已跳过:', error);
    }
  }
  return { ops, issues };
}

/** @deprecated 请使用 extractAddonJsonPatchOpsWithIssues */
export function extractAddonJsonPatchOps(message: string): MvuJsonPatchOp[] {
  return extractAddonJsonPatchOpsWithIssues(message).ops;
}

/** 对 addon_data 根对象应用 MVU 兼容 JSON Patch, 不依赖 MVU 框架 */
export function applyMvuLikePatch<T extends Record<string, unknown>>(
  data: T,
  ops: MvuJsonPatchOp[],
): { data: T; issues: PatchIssue[] } {
  const result = _.cloneDeep(data);
  const issues: PatchIssue[] = [];
  for (const op of ops) {
    try {
      applyOp(result, op);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({ kind: 'apply', message, op });
      console.warn('[addon-mvu] patch 操作失败, 已跳过:', op, error);
    }
  }
  return { data: result, issues };
}
