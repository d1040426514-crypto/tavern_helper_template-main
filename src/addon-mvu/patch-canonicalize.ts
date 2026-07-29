import type { AddonData } from './schema';
import { getWorldMap } from './schema';
import { getAtPath } from './patch-heal';
import { MvuJsonPatchOp, PatchIssue } from './patch';
import {
  ALL_FIXED_SEGMENT_KEYS,
  findUniqueAncestorChain,
  PathTreeNode,
  WORLD_ENTRY_TREE,
} from './patch-path-index';

/** 歧义段名 / 非 schema 段别名；初始为空，从日志增补 */
export type SegmentAliasRule = {
  /** 已对齐 schema 固定段后缀（世界名之后，不含动态实体） */
  contextSuffix: string[];
  /** 误写段名 */
  segment: string;
  /** 在该段之前插入的固定祖先段 */
  insertBefore: string[];
};

export const PATCH_SEGMENT_ALIASES: SegmentAliasRule[] = [];

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parseJsonPointer(path: string): string[] {
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

function encodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function encodeJsonPointer(segments: string[]): string {
  if (segments.length === 0) {
    return '/';
  }
  return `/${segments.map(encodeJsonPointerSegment).join('/')}`;
}

/** AI 扁平 path 幂等补上容器段「世界」；已带前缀或位面交汇不改 */
export function ensureWorldContainerPrefix(segments: string[]): string[] {
  if (segments.length === 0) return segments;
  if (segments[0] === '世界' || segments[0] === '位面交汇') return [...segments];
  return ['世界', ...segments];
}

function navigateToContext(contextSuffix: string[]): PathTreeNode | null {
  let node: PathTreeNode = WORLD_ENTRY_TREE;
  for (const segment of contextSuffix) {
    if (!ALL_FIXED_SEGMENT_KEYS.has(segment)) {
      return null;
    }
    const next = node.children?.[segment];
    if (!next) {
      return null;
    }
    node = next;
  }
  return node;
}

function resolveAliasInsert(alignedAfterWorld: string[], segment: string): string[] {
  for (const rule of PATCH_SEGMENT_ALIASES) {
    if (rule.segment !== segment) {
      continue;
    }
    if (rule.contextSuffix.length > alignedAfterWorld.length) {
      continue;
    }
    const suffix = alignedAfterWorld.slice(-rule.contextSuffix.length);
    if (!rule.contextSuffix.every((part, index) => suffix[index] === part)) {
      continue;
    }
    const ctxNode = navigateToContext(rule.contextSuffix);
    if (!ctxNode) {
      continue;
    }
    return rule.insertBefore;
  }
  return [];
}

function entryTemplateNode(recordNode: PathTreeNode): PathTreeNode {
  if (recordNode.children) {
    return { children: recordNode.children };
  }
  return recordNode;
}

type AlignResult = {
  nextNode: PathTreeNode;
  inserted: string[];
};

function alignSegment(
  node: PathTreeNode,
  segment: string,
  base: Record<string, unknown> | undefined,
  outputPrefix: string[],
): AlignResult {
  const direct = node.children?.[segment];
  if (direct) {
    return { nextNode: direct, inserted: [] };
  }

  const isFixed = ALL_FIXED_SEGMENT_KEYS.has(segment);

  if (node.record && !isFixed) {
    const entityPath = [...outputPrefix, segment];
    if (base && getAtPath(base, entityPath) !== undefined) {
      return { nextNode: entryTemplateNode(node), inserted: [] };
    }
    return { nextNode: entryTemplateNode(node), inserted: [] };
  }

  if (isFixed) {
    const chain = findUniqueAncestorChain(node, segment);
    if (chain) {
      let current = node;
      for (const ancestor of chain) {
        current = current.children![ancestor]!;
      }
      const target = current.children?.[segment];
      if (target) {
        return { nextNode: target, inserted: chain };
      }
    }
  }

  return { nextNode: node, inserted: [] };
}

export function canonicalizeSegments(
  segments: string[],
  base?: AddonData,
): { segments: string[]; rewrites: string[] } {
  if (segments.length <= 1) {
    return { segments: [...segments], rewrites: [] };
  }

  const output: string[] = [segments[0]!];
  const rewrites: string[] = [];
  let node = WORLD_ENTRY_TREE;
  const baseRoot = base ? (getWorldMap(base) as Record<string, unknown>) : undefined;

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;

    const aliasInsert = resolveAliasInsert(output.slice(1), segment);
    for (const ancestor of aliasInsert) {
      output.push(ancestor);
      node = node.children![ancestor]!;
      rewrites.push(`别名补层 /${ancestor}`);
    }

    const { nextNode, inserted } = alignSegment(node, segment, baseRoot, output);
    for (const ancestor of inserted) {
      output.push(ancestor);
      node = node.children![ancestor]!;
      rewrites.push(`补全固定段 /${ancestor}`);
    }

    output.push(segment);
    node = nextNode;
  }

  return { segments: output, rewrites };
}

export function canonicalizeJsonPointer(
  path: string,
  base?: AddonData,
): { path: string; rewrites: string[] } {
  let segments = parseJsonPointer(path);
  const rewrites: string[] = [];
  const hadContainer = segments[0] === '世界';

  if (segments[0] === '位面交汇') {
    return { path: encodeJsonPointer(segments), rewrites };
  }

  if (hadContainer) {
    segments = segments.slice(1);
  }

  const aligned = canonicalizeSegments(segments, base);
  rewrites.push(...aligned.rewrites);
  const prefixed = ensureWorldContainerPrefix(aligned.segments);
  if (!hadContainer && prefixed[0] === '世界') {
    rewrites.push('补容器段 /世界');
  }
  return { path: encodeJsonPointer(prefixed), rewrites };
}

export function canonicalizePatchOps(
  ops: MvuJsonPatchOp[],
  base: AddonData,
): { ops: MvuJsonPatchOp[]; issues: PatchIssue[] } {
  const issues: PatchIssue[] = [];
  const canonOps = ops.map(op => {
    if (op.op === 'move') {
      const from = canonicalizeJsonPointer(op.from, base);
      const to = canonicalizeJsonPointer(op.to, base);
      const rewrites = [...from.rewrites, ...to.rewrites];
      const canonOp = { ...op, from: from.path, to: to.path };
      if (rewrites.length > 0) {
        issues.push({
          kind: 'heal',
          message: `路径规范化: ${op.from} → ${from.path}; ${op.to} → ${to.path}`,
          op: canonOp,
        });
      }
      return canonOp;
    }

    const { path, rewrites } = canonicalizeJsonPointer(op.path, base);
    const canonOp = { ...op, path };
    if (rewrites.length > 0) {
      issues.push({
        kind: 'heal',
        message: `路径规范化: ${op.path} → ${path}`,
        op: canonOp,
      });
    }
    return canonOp;
  });

  return { ops: canonOps, issues };
}

/** normalize 后校验写操作是否落在规范路径（Phase 2 安全网） */
export function verifyCanonicalWrites(ops: MvuJsonPatchOp[], normalized: AddonData): PatchIssue[] {
  const issues: PatchIssue[] = [];
  const root = normalized as Record<string, unknown>;

  for (const op of ops) {
    if (op.op === 'remove' || op.op === 'move') {
      continue;
    }

    const segments = parseJsonPointer(op.path);
    if (segments.length === 0) {
      continue;
    }

    if (getAtPath(root, segments) === undefined) {
      issues.push({
        kind: 'apply',
        message: `规范化后写入未生效: ${op.path}`,
        op,
      });
    }
  }

  return issues;
}
