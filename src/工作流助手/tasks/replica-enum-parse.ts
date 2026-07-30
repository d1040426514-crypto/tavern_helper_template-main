import {
  buildCompositeKey,
  findAllTagInstances,
  parseCompositeKey,
  parseExtractTagSpec,
  sortAttrValues,
  type ExtractTagSpec,
} from './tag-extract';
import { tryParseJsonObject } from './strict-variable-response';

export type RelayTagMap = Map<string, string[]>;

export const REPLICA_ENUM_TAG = 'ReplicaEnum';
export const ENUM_REGISTRY_MARKER = '\u0000';
/** 定向枚举 registry 键前缀：`#replica:<rootId>|tag@attr=value` */
export const REPLICA_ENUM_DIRECTED_PREFIX = '#replica:';
export const REPLICA_ENUM_DIRECTED_SEP = '|';

export type ReplicaEnumEntry = {
  specKey: string;
  values: string[];
  /** 原始 task 引用（任务名 / baseName / id），未解析 */
  taskRef?: string;
};

export type ReplicaEnumParseResult = {
  entries: ReplicaEnumEntry[];
};

export type ResolveReplicaEnumTaskRef = (
  taskRef: string,
) => { rootId: string; specKey: string } | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSpecKey(spec: string): string | null {
  const parsed = parseExtractTagSpec(spec);
  if (!parsed?.attrName) return null;
  return `${parsed.tagName}@${parsed.attrName}`;
}

function normalizeValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const text = String(v ?? '').trim();
    if (text) out.push(text);
  }
  return sortAttrValues([...new Set(out)]);
}

function entryBucketKey(specKey: string, taskRef?: string): string {
  return `${specKey}\0${taskRef ?? ''}`;
}

function mergeEnumEntry(target: ReplicaEnumEntry[], entry: ReplicaEnumEntry): void {
  if (!entry.values.length) return;
  const key = entryBucketKey(entry.specKey, entry.taskRef);
  const existing = target.find(e => entryBucketKey(e.specKey, e.taskRef) === key);
  if (existing) {
    existing.values = sortAttrValues([...new Set([...existing.values, ...entry.values])]);
    return;
  }
  target.push({
    specKey: entry.specKey,
    values: [...entry.values],
    taskRef: entry.taskRef,
  });
}

function parseEnumEntry(obj: Record<string, unknown>): ReplicaEnumEntry | null {
  const specKey = normalizeSpecKey(String(obj.spec ?? ''));
  if (!specKey) return null;
  const values = normalizeValues(obj.values);
  if (!values.length) return null;
  const taskRaw = String(obj.task ?? '').trim();
  return {
    specKey,
    values,
    taskRef: taskRaw || undefined,
  };
}

export function extractReplicaEnumBlockInners(text: string): string[] {
  const source = String(text ?? '');
  if (!source) return [];
  return findAllTagInstances(source, REPLICA_ENUM_TAG).map(inst => inst.inner.trim()).filter(Boolean);
}

export function parseReplicaEnumJson(inner: string): ReplicaEnumParseResult {
  const result: ReplicaEnumParseResult = { entries: [] };
  const trimmed = String(inner ?? '').trim();
  if (!trimmed) return result;

  let parsed: unknown;
  try {
    parsed = tryParseJsonObject(trimmed);
  } catch {
    return result;
  }
  if (!isPlainObject(parsed)) return result;

  if (Array.isArray(parsed.enums)) {
    for (const entry of parsed.enums) {
      if (!isPlainObject(entry)) continue;
      const item = parseEnumEntry(entry);
      if (!item) continue;
      mergeEnumEntry(result.entries, item);
    }
    return result;
  }

  const single = parseEnumEntry(parsed);
  if (single) mergeEnumEntry(result.entries, single);
  return result;
}

export function parseReplicaEnumFromResponse(text: string): ReplicaEnumParseResult {
  const merged: ReplicaEnumParseResult = { entries: [] };
  for (const inner of extractReplicaEnumBlockInners(text)) {
    const block = parseReplicaEnumJson(inner);
    for (const entry of block.entries) {
      mergeEnumEntry(merged.entries, entry);
    }
  }
  return merged;
}

export function isEnumRegistryMarker(value: string): boolean {
  return String(value ?? '') === ENUM_REGISTRY_MARKER;
}

export function buildDirectedEnumRegistryKey(
  rootId: string,
  tagName: string,
  attrName: string,
  attrValue: string,
): string {
  return `${REPLICA_ENUM_DIRECTED_PREFIX}${rootId}${REPLICA_ENUM_DIRECTED_SEP}${buildCompositeKey(tagName, attrName, attrValue)}`;
}

export function isDirectedEnumRegistryKey(key: string): boolean {
  return String(key ?? '')
    .toLowerCase()
    .startsWith(REPLICA_ENUM_DIRECTED_PREFIX.toLowerCase());
}

/** 从定向键拆出 composite `tag@attr=value`；非定向键返回 null */
export function parseDirectedEnumRegistryKey(
  key: string,
): { rootId: string; compositeKey: string } | null {
  const raw = String(key ?? '');
  const prefix = REPLICA_ENUM_DIRECTED_PREFIX;
  if (!raw.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const rest = raw.slice(prefix.length);
  const sepIdx = rest.indexOf(REPLICA_ENUM_DIRECTED_SEP);
  if (sepIdx <= 0) return null;
  const rootId = rest.slice(0, sepIdx);
  const compositeKey = rest.slice(sepIdx + REPLICA_ENUM_DIRECTED_SEP.length);
  if (!rootId || !compositeKey) return null;
  return { rootId, compositeKey };
}

export function replicaEnumResultToRegistryTags(
  result: ReplicaEnumParseResult,
  resolveTaskRef?: ResolveReplicaEnumTaskRef,
): Record<string, string> {
  const out: Record<string, string> = {};
  // 某 spec 只要出现过带 task 的条目，该 spec 不再写广播键（避免 task 写错时静默吃广播全量）
  const directedIntentSpecs = new Set<string>();
  for (const entry of result.entries) {
    if (entry.taskRef) directedIntentSpecs.add(entry.specKey.toLowerCase());
  }

  for (const entry of result.entries) {
    const parsed = parseExtractTagSpec(entry.specKey);
    if (!parsed?.attrName) continue;
    const specLower = entry.specKey.toLowerCase();

    if (!entry.taskRef) {
      if (directedIntentSpecs.has(specLower)) continue;
      for (const attrValue of entry.values) {
        const key = buildCompositeKey(parsed.tagName, parsed.attrName, attrValue);
        out[key] = ENUM_REGISTRY_MARKER;
      }
      continue;
    }

    if (!resolveTaskRef) {
      console.warn(`[工作流助手] ReplicaEnum 含 task="${entry.taskRef}" 但未提供任务解析器，已忽略`);
      continue;
    }
    const resolved = resolveTaskRef(entry.taskRef);
    if (!resolved) {
      console.warn(`[工作流助手] ReplicaEnum 无法解析 task="${entry.taskRef}"，已忽略`);
      continue;
    }
    if (resolved.specKey.toLowerCase() !== entry.specKey.toLowerCase()) {
      console.warn(
        `[工作流助手] ReplicaEnum task="${entry.taskRef}" 的 spec 为 ${resolved.specKey}，与条目 ${entry.specKey} 不一致，已忽略`,
      );
      continue;
    }
    for (const attrValue of entry.values) {
      const key = buildDirectedEnumRegistryKey(
        resolved.rootId,
        parsed.tagName,
        parsed.attrName,
        attrValue,
      );
      out[key] = ENUM_REGISTRY_MARKER;
    }
  }
  return out;
}

/**
 * 收集某 spec 的枚举值。
 * 传入 rootId 时：若存在该根的定向键则只用定向；否则用广播键（忽略其它根的定向键）。
 * 未传 rootId 时：仅收集广播键。
 */
export function collectEnumRegistryAttrValues(
  relayMap: RelayTagMap,
  spec: ExtractTagSpec,
  rootId?: string,
): string[] {
  if (!spec.attrName) return [];
  const broadcastPrefix = `${spec.tagName}@${spec.attrName}=`.toLowerCase();
  const directedPrefix = rootId
    ? `${REPLICA_ENUM_DIRECTED_PREFIX}${rootId}${REPLICA_ENUM_DIRECTED_SEP}${spec.tagName}@${spec.attrName}=`.toLowerCase()
    : null;

  const directed: string[] = [];
  const broadcast: string[] = [];

  for (const [key, entries] of relayMap.entries()) {
    if (!entries.some(isEnumRegistryMarker)) continue;
    const keyLower = key.toLowerCase();

    if (directedPrefix && keyLower.startsWith(directedPrefix)) {
      const parsedDirected = parseDirectedEnumRegistryKey(key);
      if (!parsedDirected) continue;
      const parsed = parseCompositeKey(parsedDirected.compositeKey);
      if (parsed) directed.push(parsed.attrValue);
      continue;
    }

    if (isDirectedEnumRegistryKey(key)) continue;

    if (keyLower.startsWith(broadcastPrefix)) {
      const parsed = parseCompositeKey(key);
      if (parsed) broadcast.push(parsed.attrValue);
    }
  }

  if (rootId && directed.length) {
    return sortAttrValues([...new Set(directed)]);
  }
  return sortAttrValues([...new Set(broadcast)]);
}
