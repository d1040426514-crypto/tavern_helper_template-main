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

export type ReplicaEnumParseResult = {
  specs: Record<string, string[]>;
};

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

function mergeSpecValues(target: Record<string, string[]>, specKey: string, values: string[]): void {
  if (!values.length) return;
  const existing = target[specKey] ?? [];
  target[specKey] = sortAttrValues([...new Set([...existing, ...values])]);
}

function parseEnumEntry(obj: Record<string, unknown>): { specKey: string; values: string[] } | null {
  const specKey = normalizeSpecKey(String(obj.spec ?? ''));
  if (!specKey) return null;
  const values = normalizeValues(obj.values);
  if (!values.length) return null;
  return { specKey, values };
}

export function extractReplicaEnumBlockInners(text: string): string[] {
  const source = String(text ?? '');
  if (!source) return [];
  return findAllTagInstances(source, REPLICA_ENUM_TAG).map(inst => inst.inner.trim()).filter(Boolean);
}

export function parseReplicaEnumJson(inner: string): ReplicaEnumParseResult {
  const result: ReplicaEnumParseResult = { specs: {} };
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
      mergeSpecValues(result.specs, item.specKey, item.values);
    }
    return result;
  }

  const single = parseEnumEntry(parsed);
  if (single) mergeSpecValues(result.specs, single.specKey, single.values);
  return result;
}

export function parseReplicaEnumFromResponse(text: string): ReplicaEnumParseResult {
  const merged: ReplicaEnumParseResult = { specs: {} };
  for (const inner of extractReplicaEnumBlockInners(text)) {
    const block = parseReplicaEnumJson(inner);
    for (const [specKey, values] of Object.entries(block.specs)) {
      mergeSpecValues(merged.specs, specKey, values);
    }
  }
  return merged;
}

export function isEnumRegistryMarker(value: string): boolean {
  return String(value ?? '') === ENUM_REGISTRY_MARKER;
}

export function replicaEnumResultToRegistryTags(result: ReplicaEnumParseResult): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [specKey, values] of Object.entries(result.specs)) {
    const parsed = parseExtractTagSpec(specKey);
    if (!parsed?.attrName) continue;
    for (const attrValue of values) {
      const key = buildCompositeKey(parsed.tagName, parsed.attrName, attrValue);
      out[key] = ENUM_REGISTRY_MARKER;
    }
  }
  return out;
}

export function collectEnumRegistryAttrValues(
  relayMap: RelayTagMap,
  spec: ExtractTagSpec,
): string[] {
  if (!spec.attrName) return [];
  const prefix = `${spec.tagName}@${spec.attrName}=`.toLowerCase();
  const values: string[] = [];
  for (const [key, entries] of relayMap.entries()) {
    if (!key.toLowerCase().startsWith(prefix)) continue;
    if (!entries.some(isEnumRegistryMarker)) continue;
    const parsed = parseCompositeKey(key);
    if (parsed) values.push(parsed.attrValue);
  }
  return sortAttrValues([...new Set(values)]);
}
