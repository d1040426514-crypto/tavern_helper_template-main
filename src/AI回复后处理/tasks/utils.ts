import {
  buildCompositeKey,
  buildExtractSpecKey,
  compositePlaceholderToKey,
  extractInjectTagsFromResponse,
  formatAttrTagBlock,
  formatEmptyAttrTagBlock,
  isCompositeUnderAttrSpec,
  parseCompositeKey,
  parseCompositePlaceholder,
  parseDynamicAttrPlaceholder,
  parseExtractTagSpec,
  sortAttrValues,
  type ExtractTagSpec,
  findAllTagInstances,
} from './tag-extract';

export type RelayTagMap = Map<string, string[]>;

export {
  buildAttrGroupKey,
  buildCompositeKey,
  buildExtractSpecKey,
  compositePlaceholderToKey,
  parseCompositeKey,
  parseCompositePlaceholder,
  parseDynamicAttrPlaceholder,
  parseExtractTagSpec,
  sortAttrValues,
  type ExtractTagSpec,
} from './tag-extract';

export function extractLastTagContent(text: string, tagName: string): string | null {
  if (!text || !tagName) return null;
  const lower = text.toLowerCase();
  const open = `<${tagName.toLowerCase()}>`;
  const close = `</${tagName.toLowerCase()}>`;
  const closeIdx = lower.lastIndexOf(close);
  if (closeIdx === -1) return null;
  const openIdx = lower.lastIndexOf(open, closeIdx);
  if (openIdx === -1) return null;
  return text.slice(openIdx + open.length, closeIdx);
}

export function extractAllTagsFromResponse(text: string, tagNames: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const tag of tagNames) {
    const content = extractLastTagContent(text, tag);
    if (content != null) result[tag] = content.trim();
  }
  return result;
}

export interface PlotTagExtractionResult {
  tagNames: string[];
  extractedTags: Record<string, string>;
  /** 全部摘取片段，用于 {{task:任务名}} */
  injectedFragments: string[];
  injectOnlyTagNames: string[];
}

/** @deprecated 请使用 isStoredFullBlockForKey(key, value) */
export function isFullBlockTagValue(value: string): boolean {
  const v = String(value ?? '').trimStart();
  return v.startsWith('<') && v.includes('>');
}

export function bareTagNameFromKey(key: string): string {
  const at = key.indexOf('@');
  return at === -1 ? key : key.slice(0, at);
}

/** 判断 value 是否已是 key 对应标签名的完整开标签块（避免裸名 inner 含子标签时误判） */
export function isStoredFullBlockForKey(key: string, value: string): boolean {
  const v = String(value ?? '').trimStart();
  if (!v.startsWith('<') || !v.includes('>')) return false;

  const bare = bareTagNameFromKey(key);
  if (!bare) return false;

  const openPrefix = `<${bare.toLowerCase()}`;
  const vLower = v.toLowerCase();
  if (!vLower.startsWith(openPrefix)) return false;

  const next = vLower[openPrefix.length];
  if (next === undefined) return true;
  if (next === '>' || next === '/' || next === ' ' || next === '\t' || next === '\n' || next === '\r') {
    return true;
  }
  if (/[a-z0-9_-]/i.test(next)) return false;
  return true;
}

export function formatTagValueForInject(key: string, value: string): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (isStoredFullBlockForKey(key, v)) return v;
  const parsed = parseCompositeKey(key);
  if (parsed) return formatAttrTagBlock(parsed.tagName, parsed.attrName, parsed.attrValue, v);
  const bare = bareTagNameFromKey(key);
  return `<${bare}>${v}</${bare}>`;
}

export function formatTagValuesForInject(key: string, values: string[]): string {
  const parts = values.map(v => formatTagValueForInject(key, v)).filter(Boolean);
  return parts.join('\n\n');
}

function extractTagsList(tags: string[]): string[] {
  return tags.map(t => t.trim()).filter(Boolean);
}

export function extractPlotTagsFromResponse(text: string, extractInjectTags: string[] = []): PlotTagExtractionResult {
  const injectTagNames = extractTagsList(extractInjectTags);
  const { extractedTags, injectedFragments, resolvedKeys } = extractInjectTagsFromResponse(text, injectTagNames);

  return {
    tagNames: injectTagNames,
    extractedTags,
    injectedFragments,
    injectOnlyTagNames: [...new Set([...injectTagNames, ...resolvedKeys])],
  };
}

/** @deprecated 请使用 extractPlotTagsFromResponse */
export function extractTagsFromText(text: string, tagNames: string[]): string {
  const parts: string[] = [];
  for (const tag of tagNames) {
    const content = extractLastTagContent(text, tag);
    if (content != null) parts.push(`<${tag}>${content}</${tag}>`);
  }
  return parts.join('\n\n');
}

export const PLOT_TAG_PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

function isPlotTagPlaceholderName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !trimmed.toLowerCase().startsWith('task:');
}

export function getPlotPlaceholderTagNames(text: string): string[] {
  const names: string[] = [];
  const re = new RegExp(PLOT_TAG_PLACEHOLDER_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text || ''))) !== null) {
    const name = match[1]?.trim();
    if (name && isPlotTagPlaceholderName(name)) names.push(name);
  }
  return [...new Set(names)];
}

function findMapKeyIgnoreCase(tagMap: RelayTagMap, key: string): string | undefined {
  if (tagMap.has(key)) return key;
  const lower = key.toLowerCase();
  for (const candidate of tagMap.keys()) {
    if (candidate.toLowerCase() === lower) return candidate;
  }
  return undefined;
}

export function collectRelayKeysForBareTag(tagMap: RelayTagMap, bareTagName: string): string[] {
  const lower = bareTagName.toLowerCase();
  const keys: string[] = [];
  for (const k of tagMap.keys()) {
    const kl = k.toLowerCase();
    if (kl === lower || kl.startsWith(`${lower}@`)) keys.push(k);
  }
  return keys.sort((a, b) => a.localeCompare(b));
}

/** 收集 tag@attr=* 复合 key（不含裸 tag key） */
export function collectCompositeKeysForAttrSpec(
  tagMap: RelayTagMap,
  spec: { tagName: string; attrName: string },
): string[] {
  const prefix = `${spec.tagName}@${spec.attrName}=`.toLowerCase();
  const keyByAttr = new Map<string, string>();
  for (const k of tagMap.keys()) {
    if (!k.toLowerCase().startsWith(prefix)) continue;
    const parsed = parseCompositeKey(k);
    if (parsed) keyByAttr.set(parsed.attrValue, k);
  }
  return sortAttrValues([...keyByAttr.keys()]).map(v => keyByAttr.get(v)!);
}

export function collectAttrValuesFromRelay(
  tagMap: RelayTagMap,
  spec: { tagName: string; attrName: string },
): string[] {
  const values: string[] = [];
  for (const key of collectCompositeKeysForAttrSpec(tagMap, spec)) {
    const parsed = parseCompositeKey(key);
    if (parsed) values.push(parsed.attrValue);
  }
  return sortAttrValues([...new Set(values)]);
}

export function resolveDynamicAttrInjectText(
  tagMap: RelayTagMap,
  placeholderName: string,
): string {
  const dyn = parseDynamicAttrPlaceholder(placeholderName);
  if (!dyn) return '';
  const keys = collectCompositeKeysForAttrSpec(tagMap, dyn);
  const parts: string[] = [];
  for (const key of keys) {
    const values = tagMap.get(key) ?? [];
    const formatted = formatTagValuesForInject(key, values);
    if (formatted) parts.push(formatted);
  }
  return parts.join('\n\n');
}

export function resolvePlaceholderBlocks(tagMap: RelayTagMap, placeholderName: string): string[] {
  const dyn = parseDynamicAttrPlaceholder(placeholderName);
  if (dyn) {
    const blocks: string[] = [];
    for (const key of collectCompositeKeysForAttrSpec(tagMap, dyn)) {
      for (const v of tagMap.get(key) ?? []) {
        if (v) blocks.push(v);
      }
    }
    return blocks;
  }

  const compositeKey = compositePlaceholderToKey(placeholderName);
  if (compositeKey) {
    const mapKey = findMapKeyIgnoreCase(tagMap, compositeKey);
    if (!mapKey) return [];
    return (tagMap.get(mapKey) ?? []).filter(Boolean);
  }

  const keys = collectRelayKeysForBareTag(tagMap, placeholderName);
  const blocks: string[] = [];
  for (const key of keys) {
    const values = tagMap.get(key) ?? [];
    for (const v of values) {
      if (v) blocks.push(v);
    }
  }
  return blocks;
}

export function resolvePlaceholderInjectTextFromMap(tagMap: RelayTagMap, placeholderName: string): string {
  const dynOut = resolveDynamicAttrInjectText(tagMap, placeholderName);
  if (dynOut) return dynOut;
  if (parseDynamicAttrPlaceholder(placeholderName)) return '';

  const compositeKey = compositePlaceholderToKey(placeholderName);
  if (compositeKey) {
    const mapKey = findMapKeyIgnoreCase(tagMap, compositeKey);
    if (!mapKey) return '';
    return formatTagValuesForInject(mapKey, tagMap.get(mapKey) ?? []);
  }

  const keys = collectRelayKeysForBareTag(tagMap, placeholderName);
  const parts: string[] = [];
  for (const key of keys) {
    const values = tagMap.get(key) ?? [];
    const formatted = formatTagValuesForInject(key, values);
    if (formatted) parts.push(formatted);
  }
  return parts.join('\n\n');
}

/** @deprecated 单 map 解析，不含嵌套刷新；请优先使用 resolvePlaceholderForInject */
export function resolvePlaceholderInjectText(tagMap: RelayTagMap, placeholderName: string): string {
  return resolvePlaceholderInjectTextFromMap(tagMap, placeholderName);
}

export type PlotPlaceholderResolveOptions = {
  restrictToInjectOnly?: boolean;
  historyFallback?: 'inject-only' | 'all-tags';
  replicaAttrSpec?: { tagName: string; attrName: string };
};

function applyNestedRefresh(
  text: string,
  relayTagMap: RelayTagMap,
  messageVarHistoryMap: RelayTagMap,
  injectOnlyTags: Set<string>,
  historyFallback: 'inject-only' | 'all-tags',
  skipKeys?: Set<string>,
): string {
  if (!text) return text;
  return refreshNestedExtractTagsInContent(text, relayTagMap, messageVarHistoryMap, injectOnlyTags, {
    historyFallback,
    skipKeys,
  });
}

export function resolvePlaceholderForInject(
  placeholderName: string,
  relayTagMap: RelayTagMap,
  messageVarHistoryMap: RelayTagMap,
  injectOnlyTags: Set<string>,
  options?: PlotPlaceholderResolveOptions,
): string {
  const historyFallback = options?.historyFallback ?? 'inject-only';
  const replicaSpec = options?.replicaAttrSpec;

  if (replicaSpec && isCompositeUnderAttrSpec(placeholderName, replicaSpec)) {
    const parsed = parseCompositePlaceholder(placeholderName);
    const compositeKey = compositePlaceholderToKey(placeholderName);
    const skipKeys = compositeKey ? new Set([compositeKey]) : undefined;
    const histOut = resolvePlaceholderInjectTextFromMap(messageVarHistoryMap, placeholderName);
    if (histOut) {
      return applyNestedRefresh(
        histOut,
        relayTagMap,
        messageVarHistoryMap,
        injectOnlyTags,
        historyFallback,
        skipKeys,
      );
    }
    if (parsed) {
      return formatEmptyAttrTagBlock(parsed.tagName, parsed.attrName, parsed.attrValue);
    }
    return '';
  }

  const relayOut = resolvePlaceholderInjectTextFromMap(relayTagMap, placeholderName);
  if (relayOut) {
    return applyNestedRefresh(relayOut, relayTagMap, messageVarHistoryMap, injectOnlyTags, historyFallback);
  }

  if (shouldUseHistoryFallback(placeholderName, injectOnlyTags, historyFallback)) {
    const histOut = resolvePlaceholderInjectTextFromMap(messageVarHistoryMap, placeholderName);
    if (histOut) {
      return applyNestedRefresh(histOut, relayTagMap, messageVarHistoryMap, injectOnlyTags, historyFallback);
    }
  }
  return '';
}

export function isPlaceholderInjectAllowed(placeholderName: string, injectOnlyTags: Set<string>): boolean {
  const lower = placeholderName.toLowerCase();
  for (const spec of injectOnlyTags) {
    if (spec.toLowerCase() === lower) return true;
  }

  const compositeKey = compositePlaceholderToKey(placeholderName);
  if (compositeKey) {
    const parsed = parseCompositePlaceholder(placeholderName);
    if (parsed) {
      const specKey = `${parsed.tagName}@${parsed.attrName}`.toLowerCase();
      for (const spec of injectOnlyTags) {
        if (spec.toLowerCase() === specKey) return true;
      }
    }
    return false;
  }

  const dyn = parseDynamicAttrPlaceholder(placeholderName);
  if (dyn) {
    const specKey = buildExtractSpecKey(dyn.tagName, dyn.attrName).toLowerCase();
    for (const spec of injectOnlyTags) {
      if (spec.toLowerCase() === specKey) return true;
    }
    return false;
  }

  for (const spec of injectOnlyTags) {
    const parsed = parseExtractTagSpec(spec);
    if (!parsed) continue;
    if (parsed.tagName.toLowerCase() === lower) return true;
  }
  return false;
}

export function buildPlotTagMapFromText(text: string, requestedTagNames?: string[] | null): RelayTagMap {
  const map: RelayTagMap = new Map();
  const source = String(text || '');
  if (!source.trim()) return map;

  const tagNames = requestedTagNames?.length
    ? [...new Set(requestedTagNames.map(t => String(t).trim()).filter(Boolean))]
    : getPlotPlaceholderTagNames(source);

  for (const tagName of tagNames) {
    const content = extractLastTagContent(source, tagName);
    if (content != null) map.set(tagName, [content.trim()]);
  }
  return map;
}

export function mergeRelayTagMap(target: RelayTagMap, extracted: Record<string, string>): void {
  for (const [tag, content] of Object.entries(extracted)) {
    if (!content) continue;
    target.set(tag, [content]);
  }
}

function collectRefreshKeys(
  injectOnlyTags: Set<string>,
  relayMap: RelayTagMap,
  historyMap: RelayTagMap,
): string[] {
  const keys = new Set<string>();
  for (const spec of injectOnlyTags) {
    const parsed = parseExtractTagSpec(spec);
    if (!parsed) continue;
    if (parsed.attrName) {
      const prefix = `${parsed.tagName}@${parsed.attrName}=`.toLowerCase();
      for (const map of [relayMap, historyMap]) {
        for (const k of map.keys()) {
          if (k.toLowerCase().startsWith(prefix)) keys.add(k);
        }
      }
    } else {
      keys.add(parsed.tagName);
    }
  }
  return [...keys].sort((a, b) => {
    const aComp = a.includes('@') && a.includes('=');
    const bComp = b.includes('@') && b.includes('=');
    if (aComp !== bComp) return aComp ? -1 : 1;
    return b.length - a.length;
  });
}

function isSkippedRefreshKey(key: string, skipKeys?: Set<string>): boolean {
  if (!skipKeys?.size) return false;
  const lower = key.toLowerCase();
  for (const sk of skipKeys) {
    if (sk.toLowerCase() === lower) return true;
  }
  return false;
}

function resolveCurrentFormattedBlockForKey(
  key: string,
  relayMap: RelayTagMap,
  historyMap: RelayTagMap,
  injectOnlyTags: Set<string>,
  historyFallback: 'inject-only' | 'all-tags',
): string {
  const parsed = parseCompositeKey(key);
  const placeholderName = parsed
    ? `${parsed.tagName}@${parsed.attrName}=${parsed.attrValue}`
    : key;

  const relayKey = findMapKeyIgnoreCase(relayMap, key);
  if (relayKey) {
    const out = formatTagValuesForInject(relayKey, relayMap.get(relayKey) ?? []);
    if (out) return out;
  }

  if (shouldUseHistoryFallback(placeholderName, injectOnlyTags, historyFallback)) {
    const histKey = findMapKeyIgnoreCase(historyMap, key);
    if (histKey) {
      const out = formatTagValuesForInject(histKey, historyMap.get(histKey) ?? []);
      if (out) return out;
    }
  }
  return '';
}

/** 将 content 内已配置的提取标签实例替换为 relay/history 中的最新内容（多轮直至稳定） */
export function refreshNestedExtractTagsInContent(
  content: string,
  relayMap: RelayTagMap,
  historyMap: RelayTagMap,
  injectOnlyTags: Set<string>,
  options?: { historyFallback?: 'inject-only' | 'all-tags'; skipKeys?: Set<string> },
): string {
  const source = String(content ?? '');
  if (!source.trim() || !injectOnlyTags.size) return source;

  const historyFallback = options?.historyFallback ?? 'inject-only';
  const skipKeys = options?.skipKeys;
  let result = source;

  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    const keys = collectRefreshKeys(injectOnlyTags, relayMap, historyMap);

    for (const key of keys) {
      if (isSkippedRefreshKey(key, skipKeys)) continue;
      const parsed = parseCompositeKey(key);
      const tagName = parsed ? parsed.tagName : key;
      const replacement = resolveCurrentFormattedBlockForKey(
        key,
        relayMap,
        historyMap,
        injectOnlyTags,
        historyFallback,
      );
      if (!replacement) continue;

      const instances = findAllTagInstances(result, tagName);
      for (const inst of instances) {
        if (parsed) {
          const attrVal = inst.attrs[parsed.attrName.toLowerCase()];
          if (attrVal !== parsed.attrValue) continue;
        }
        if (inst.fullBlock === replacement) continue;
        while (result.includes(inst.fullBlock)) {
          result = result.replace(inst.fullBlock, replacement);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return result;
}

export function getPlotTagMapValue(tagMap: RelayTagMap, tagName: string): { found: boolean; value: string[] } {
  const compositeKey = compositePlaceholderToKey(tagName);
  if (compositeKey) {
    const mapKey = findMapKeyIgnoreCase(tagMap, compositeKey);
    if (mapKey) return { found: true, value: tagMap.get(mapKey)! };
    return { found: false, value: [] };
  }

  if (tagMap.has(tagName)) {
    return { found: true, value: tagMap.get(tagName)! };
  }
  const lowered = tagName.toLowerCase();
  for (const [candidate, value] of tagMap.entries()) {
    if (candidate.toLowerCase() === lowered) {
      return { found: true, value };
    }
  }
  return { found: false, value: [] };
}

/** @deprecated 请使用 replacePlotTagPlaceholdersWithHistory */
export function replacePlotTagPlaceholders(
  text: string,
  relayTagMap: RelayTagMap,
  historyTagMap: RelayTagMap,
): string {
  return replacePlotTagPlaceholdersWithHistory(text, relayTagMap, historyTagMap, new Set());
}

function shouldUseHistoryFallback(
  tagName: string,
  injectOnlyTags: Set<string>,
  historyFallback: 'inject-only' | 'all-tags',
): boolean {
  return historyFallback === 'all-tags' || isPlaceholderInjectAllowed(tagName, injectOnlyTags);
}

export function replacePlotTagPlaceholdersWithHistory(
  text: string,
  relayTagMap: RelayTagMap,
  messageVarHistoryMap: RelayTagMap,
  injectOnlyTags: Set<string>,
  options?: PlotPlaceholderResolveOptions,
): string {
  const re = new RegExp(PLOT_TAG_PLACEHOLDER_RE.source, 'g');
  const historyFallback = options?.historyFallback ?? 'inject-only';

  return String(text || '').replace(re, (placeholder, rawName: string) => {
    const tagName = rawName.trim();
    if (!tagName || !isPlotTagPlaceholderName(tagName)) return placeholder;

    if (options?.restrictToInjectOnly && !isPlaceholderInjectAllowed(tagName, injectOnlyTags)) {
      return '';
    }

    const out = resolvePlaceholderForInject(
      tagName,
      relayTagMap,
      messageVarHistoryMap,
      injectOnlyTags,
      options,
    );
    return out;
  });
}

export function isPromptGroupEnabled(group: { enabled?: boolean }): boolean {
  return group.enabled !== false;
}

export function buildTaskWorldbookTriggerText(
  promptGroups: { content: string; enabled?: boolean }[],
  relayTagMap: RelayTagMap,
  messageVarHistoryMap: RelayTagMap,
  injectOnlyTags: Set<string>,
  options?: PlotPlaceholderResolveOptions,
): string {
  const tagNames: string[] = [];
  const seen = new Set<string>();
  for (const group of promptGroups) {
    if (!isPromptGroupEnabled(group)) continue;
    for (const name of getPlotPlaceholderTagNames(group.content)) {
      if (!seen.has(name)) {
        seen.add(name);
        tagNames.push(name);
      }
    }
  }
  if (!tagNames.length) return '';

  const blocks: string[] = [];
  for (const tagName of tagNames) {
    const out = resolvePlaceholderForInject(
      tagName,
      relayTagMap,
      messageVarHistoryMap,
      injectOnlyTags,
      options,
    );
    if (!out) continue;
    blocks.push(out);
  }
  return blocks.join('\n');
}

export function expandWritableKeysFromPlaceholder(
  placeholderName: string,
  availableKeys: Iterable<string>,
): string[] {
  const dyn = parseDynamicAttrPlaceholder(placeholderName);
  if (dyn) {
    return collectCompositeKeysForAttrSpec(
      new Map([...availableKeys].map(k => [k, []])),
      dyn,
    );
  }

  const compositeKey = compositePlaceholderToKey(placeholderName);
  if (compositeKey) {
    const keys = [...availableKeys];
    const found = keys.find(k => k.toLowerCase() === compositeKey.toLowerCase());
    return found ? [found] : [];
  }
  return collectRelayKeysForBareTag(new Map([...availableKeys].map(k => [k, []])), placeholderName);
}

export function replacePlaceholdersInText(text: string, vars: Record<string, string>): string {
  let result = text;
  const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const value = vars[key] ?? '';
    result = result.split(key).join(value);
  }
  return result;
}

export const PLACEHOLDER_LEGEND: { code: string; desc: string }[] = [
  {
    code: '$1',
    desc: '剧情世界书绿灯扫描，替换为 <worldbook_context> 块；基于最近 N 条 AI 楼（提取/排除与 gametxt 规则同 $7）+ 提示词 {{标签名}} 触发；N 同 contextTurnCount；条目内容支持酒馆宏/EJS。在「世界书与上下文」开启「按任务配置 $1 世界书」后可逐任务自定义，否则全部沿用默认世界书',
  },
  { code: '$5', desc: '纪要索引（世界书条目或数据库表快照；支持酒馆宏/EJS）' },
  { code: '$7', desc: '最近 N 条 AI 楼层上下文（提取/排除规则同「$7 默认上下文」）；在「世界书与上下文」开启「按任务配置 $7 上下文」后可逐任务自定义 N 与规则，否则全部沿用默认' },
  {
    code: '$8',
    desc: '上一楼用户输入。① 优先从标签名含「输入」或 input 的 XML 标签取最后一次内文；② 若无，则删除从首个「以上是」+（用户的本轮输入 | Participant的本轮输入 | <用户本轮输入> | <本轮用户输入>）行起至文末的全部内容，保留该行之前的文本为正文（「以下是…」不匹配）；③ 剔除 (⚠️:…) 预设警告块',
  },
  { code: '$U', desc: '用户 persona 描述（支持酒馆宏/EJS）' },
  { code: '$C', desc: '当前角色 description（支持酒馆宏/EJS）' },
  {
    code: '{{标签名}}',
    desc: '同轮 relay 优先；relay 缺省时从 post_process_tags 回退。副本族仅借 relay 决定副本数量，占位符内容读楼层变量（无数据时输出空属性标签块）。同 key 后阶段覆盖先阶段。引用外层标签时内层已配置提取标签会随 relay 刷新。支持 item@id 配置：{{item}} 展开全部实例；{{item@id}} 展开全部 item@id=*；{{item@id=1}} 精确引用。',
  },
  { code: '{{task:任务名}}', desc: '聊天注入模板中的任务结果占位' },
  {
    code: 'structuredOutputMode',
    desc: '任务级严格 JSON 变量更新（mvu_json_patch / addon_json_patch）：需配合 API 预设 DeepSeek 结构化模板；解析失败会重试，成功则归一化为 <UpdateVariable> 包裹块',
  },
  { code: '{{char}} 等', desc: '提示词段在脚本占位符替换后，会再经酒馆宏、助手宏与 EJS 模板处理' },
  {
    code: 'post_process_tags',
    desc: '【非占位符】消息楼层标签变量；复合 key 如 post_process_tags.item@id=1。item@id 配置下无 id 的实例回退裸 key item',
  },
];
