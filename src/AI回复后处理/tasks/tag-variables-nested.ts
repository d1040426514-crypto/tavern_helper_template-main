import {
  buildAttrGroupKey,
  buildCompositeKey,
  parseCompositeKey,
  parseDynamicAttrPlaceholder,
  sortAttrValues,
} from './tag-extract';

export type TagContainerRaw = Record<string, unknown>;

/** 从楼层变量 raw 容器扁平化为 relay flat keys */
export function flattenTagContainerToRelayKeys(raw: TagContainerRaw): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const groupKey = key;
      const parts = groupKey.split('_');
      if (parts.length >= 2) {
        const attrName = parts.pop()!;
        const tagName = parts.join('_');
        for (const [attrValue, block] of Object.entries(value as Record<string, unknown>)) {
          if (block === undefined || block === null) continue;
          const text = String(block).trim();
          if (!text) continue;
          out[buildCompositeKey(tagName, attrName, attrValue)] = text;
        }
        continue;
      }
    }
    const text = String(value).trim();
    if (text) out[key] = text;
  }
  return out;
}

/** 读取楼层变量容器：flat string + nested group 均支持 */
export function readTagContainerExtended(variables: Record<string, unknown>): Record<string, string> {
  const raw = variables.post_process_tags;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return flattenTagContainerToRelayKeys(raw as TagContainerRaw);
}

export type DynamicAttrWritePlan = {
  groupKey: string;
  spec: { tagName: string; attrName: string };
  entries: Record<string, string>;
  pruneToAttrValues: string[];
};

export function buildDynamicAttrWritePlan(
  placeholderName: string,
  aggregatedFlat: Record<string, string>,
): DynamicAttrWritePlan | null {
  const dyn = parseDynamicAttrPlaceholder(placeholderName);
  if (!dyn) return null;

  const groupKey = buildAttrGroupKey(dyn.tagName, dyn.attrName);
  const prefix = `${dyn.tagName}@${dyn.attrName}=`.toLowerCase();
  const entries: Record<string, string> = {};
  const attrValues: string[] = [];

  for (const [key, value] of Object.entries(aggregatedFlat)) {
    if (!key.toLowerCase().startsWith(prefix)) continue;
    const parsed = parseCompositeKey(key);
    if (!parsed) continue;
    const text = String(value ?? '').trim();
    if (!text) continue;
    entries[parsed.attrValue] = text;
    attrValues.push(parsed.attrValue);
  }

  if (!Object.keys(entries).length) return null;

  return {
    groupKey,
    spec: dyn,
    entries,
    pruneToAttrValues: sortAttrValues([...new Set(attrValues)]),
  };
}

/** 将 nested group 合并进 raw post_process_tags 对象，并裁剪多余 attr key */
export function mergeNestedGroupIntoRawContainer(
  raw: TagContainerRaw,
  plan: DynamicAttrWritePlan,
): TagContainerRaw {
  const next: TagContainerRaw = { ...raw };
  const existing = next[plan.groupKey];
  const merged: Record<string, string> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, string>) }
      : {};

  for (const [attrValue, block] of Object.entries(plan.entries)) {
    merged[attrValue] = block;
  }

  const keep = new Set(plan.pruneToAttrValues);
  for (const k of Object.keys(merged)) {
    if (!keep.has(k)) delete merged[k];
  }

  next[plan.groupKey] = merged;
  return next;
}

export function isDynamicAttrPlaceholder(placeholderName: string): boolean {
  return parseDynamicAttrPlaceholder(placeholderName) != null;
}
