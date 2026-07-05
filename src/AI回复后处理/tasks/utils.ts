import {
  buildCompositeKey,
  compositePlaceholderToKey,
  extractInjectTagsFromResponse,
  parseCompositePlaceholder,
  parseExtractTagSpec,
  type ExtractTagSpec,
} from './tag-extract';

export type RelayTagMap = Map<string, string[]>;

export {
  buildCompositeKey,
  compositePlaceholderToKey,
  parseCompositePlaceholder,
  parseExtractTagSpec,
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

export function isFullBlockTagValue(value: string): boolean {
  const v = String(value ?? '').trimStart();
  return v.startsWith('<') && v.includes('>');
}

export function bareTagNameFromKey(key: string): string {
  const at = key.indexOf('@');
  return at === -1 ? key : key.slice(0, at);
}

export function formatTagValueForInject(key: string, value: string): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (isFullBlockTagValue(v)) return v;
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

export function resolvePlaceholderBlocks(tagMap: RelayTagMap, placeholderName: string): string[] {
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

export function resolvePlaceholderInjectText(tagMap: RelayTagMap, placeholderName: string): string {
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
    if (!target.has(tag)) target.set(tag, []);
    target.get(tag)!.push(content);
  }
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
  options?: { restrictToInjectOnly?: boolean; historyFallback?: 'inject-only' | 'all-tags' },
): string {
  const re = new RegExp(PLOT_TAG_PLACEHOLDER_RE.source, 'g');
  const historyFallback = options?.historyFallback ?? 'inject-only';

  return String(text || '').replace(re, (placeholder, rawName: string) => {
    const tagName = rawName.trim();
    if (!tagName || !isPlotTagPlaceholderName(tagName)) return placeholder;

    if (options?.restrictToInjectOnly) {
      if (!isPlaceholderInjectAllowed(tagName, injectOnlyTags)) return '';
      const relayOut = resolvePlaceholderInjectText(relayTagMap, tagName);
      if (relayOut) return relayOut;
      if (shouldUseHistoryFallback(tagName, injectOnlyTags, historyFallback)) {
        const histOut = resolvePlaceholderInjectText(messageVarHistoryMap, tagName);
        if (histOut) return histOut;
      }
      return '';
    }

    const relayOut = resolvePlaceholderInjectText(relayTagMap, tagName);
    if (relayOut) return relayOut;

    if (shouldUseHistoryFallback(tagName, injectOnlyTags, historyFallback)) {
      const histOut = resolvePlaceholderInjectText(messageVarHistoryMap, tagName);
      if (histOut) return histOut;
    }
    return '';
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
  options?: { historyFallback?: 'inject-only' | 'all-tags' },
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

  const historyFallback = options?.historyFallback ?? 'inject-only';
  const blocks: string[] = [];
  for (const tagName of tagNames) {
    let out = resolvePlaceholderInjectText(relayTagMap, tagName);
    if (!out) {
      const useHistory =
        historyFallback === 'all-tags' || isPlaceholderInjectAllowed(tagName, injectOnlyTags);
      if (useHistory) {
        out = resolvePlaceholderInjectText(messageVarHistoryMap, tagName);
      }
    }
    if (!out) continue;
    blocks.push(out);
  }
  return blocks.join('\n');
}

export function expandWritableKeysFromPlaceholder(
  placeholderName: string,
  availableKeys: Iterable<string>,
): string[] {
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
    desc: '同轮 relay 优先；relay 缺省时从 post_process_tags 回退（只要楼层变量有值即可引用，不限于提取写入标签白名单）。支持 item@id 配置：{{item}} 展开全部实例（含 item@id=* 与裸 item）；{{item@id=1}} 精确引用。引用输出带原始属性的完整标签块，避免双重包裹',
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
