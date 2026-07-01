export type RelayTagMap = Map<string, string[]>;

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

export function extractPlotTagsFromResponse(text: string, extractInjectTags: string[] = []): PlotTagExtractionResult {
  const injectTagNames = extractTagsList(extractInjectTags);

  const extractedTags: Record<string, string> = {};
  const injectedFragments: string[] = [];
  const injectOnlyTagNames: string[] = [];

  for (const tagName of injectTagNames) {
    const content = extractLastTagContent(text, tagName);
    if (content === null) continue;
    const trimmed = content.trim();
    extractedTags[tagName] = trimmed;
    const block = `<${tagName}>${trimmed}</${tagName}>`;
    injectedFragments.push(block);
    injectOnlyTagNames.push(tagName);
  }

  return {
    tagNames: injectTagNames,
    extractedTags,
    injectedFragments,
    injectOnlyTagNames,
  };
}

function extractTagsList(tags: string[]): string[] {
  return tags.map(t => t.trim()).filter(Boolean);
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

export function getPlotPlaceholderTagNames(text: string): string[] {
  const names: string[] = [];
  const re = /\{\{(\w+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text || ''))) !== null) {
    const name = match[1]?.trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
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

export function replacePlotTagPlaceholdersWithHistory(
  text: string,
  relayTagMap: RelayTagMap,
  messageVarHistoryMap: RelayTagMap,
  injectOnlyTags: Set<string>,
  options?: { restrictToInjectOnly?: boolean },
): string {
  const re = /\{\{(\w+)\}\}/g;
  const injectLower = new Set([...injectOnlyTags].map(t => t.toLowerCase()));

  return String(text || '').replace(re, (_placeholder, tagName: string) => {
    const lower = tagName.toLowerCase();

    if (options?.restrictToInjectOnly) {
      if (!injectLower.has(lower)) return '';
      const agg = getPlotTagMapValue(relayTagMap, tagName);
      if (!agg.found || !agg.value.length) return '';
      return `<${tagName}>${agg.value.join('\n\n')}</${tagName}>`;
    }

    const relay = getPlotTagMapValue(relayTagMap, tagName);
    if (relay.found && relay.value.length) {
      return `<${tagName}>${relay.value.join('\n\n')}</${tagName}>`;
    }
    if (injectLower.has(lower)) {
      const hist = getPlotTagMapValue(messageVarHistoryMap, tagName);
      if (hist.found && hist.value.length) {
        return `<${tagName}>${hist.value.join('\n\n')}</${tagName}>`;
      }
    }
    return '';
  });
}

export function buildTaskWorldbookTriggerText(
  promptGroups: { content: string }[],
  relayTagMap: RelayTagMap,
  messageVarHistoryMap: RelayTagMap,
  injectOnlyTags: Set<string>,
): string {
  const tagNames: string[] = [];
  const seen = new Set<string>();
  for (const group of promptGroups) {
    for (const name of getPlotPlaceholderTagNames(group.content)) {
      if (!seen.has(name)) {
        seen.add(name);
        tagNames.push(name);
      }
    }
  }
  if (!tagNames.length) return '';

  const injectLower = new Set([...injectOnlyTags].map(t => t.toLowerCase()));
  const blocks: string[] = [];
  for (const tagName of tagNames) {
    const relay = getPlotTagMapValue(relayTagMap, tagName);
    let contents = relay.found && relay.value.length ? relay.value : [];
    if (!contents.length && injectLower.has(tagName.toLowerCase())) {
      contents = getPlotTagMapValue(messageVarHistoryMap, tagName).value;
    }
    if (!contents.length) continue;
    blocks.push(`<${tagName}>${contents.join('\n\n')}</${tagName}>`);
  }
  return blocks.join('\n');
}

export function replacePlaceholdersInText(text: string, vars: Record<string, string>): string {
  let result = text;
  const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const value = vars[key] ?? '';
    result = result.split(key).join(value);
    if (key.startsWith('$')) continue;
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

export const PLACEHOLDER_LEGEND: { code: string; desc: string }[] = [
  { code: '$1', desc: '后处理世界书扫描内容（按提示词中的 {{标签名}} 触发条目；条目内容支持酒馆宏/EJS）' },
  { code: '$5', desc: '纪要索引（世界书条目或数据库表快照；支持酒馆宏/EJS）' },
  { code: 'post_process_tags', desc: '消息楼层标签变量容器；正常后处理读当前楼（继承快照）；重跑读上一楼' },
  { code: '$7', desc: '最近 N 条 AI 楼层上下文（N 由全局「标签筛选」中的条数设置）' },
  { code: '$8', desc: '本轮用户输入' },
  { code: '$U', desc: '用户 persona 描述（支持酒馆宏/EJS）' },
  { code: '$C', desc: '当前角色 description（支持酒馆宏/EJS）' },
  { code: '{{标签名}}', desc: '同轮 relay 优先；提取写入标签在 relay 缺省时从 post_process_tags 回退（正常读当前楼，重跑读上一楼）' },
  { code: '{{自定义变量}}', desc: '在「自定义变量」中定义的键名' },
  { code: '{{task:任务名}}', desc: '聊天注入模板中的任务结果占位' },
  { code: '{{char}} 等', desc: '提示词段在脚本占位符替换后，会再经酒馆宏、助手宏与 EJS 模板处理' },
];
