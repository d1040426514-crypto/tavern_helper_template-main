export type ExtractTagSpec = {
  tagName: string;
  attrName?: string;
};

export function parseExtractTagSpec(spec: string): ExtractTagSpec | null {
  const trimmed = spec.trim();
  if (!trimmed) return null;
  const atIdx = trimmed.indexOf('@');
  if (atIdx === -1) return { tagName: trimmed };
  const tagName = trimmed.slice(0, atIdx).trim();
  const attrName = trimmed.slice(atIdx + 1).trim();
  if (!tagName || !attrName) return null;
  return { tagName, attrName };
}

export function buildCompositeKey(tagName: string, attrName: string, attrValue: string): string {
  return `${tagName}@${attrName}=${attrValue}`;
}

/** 动态属性占位符 {{tag@attr}}（无 =值） */
export function parseDynamicAttrPlaceholder(name: string): { tagName: string; attrName: string } | null {
  const trimmed = name.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx === -1) return null;
  const eqIdx = trimmed.indexOf('=', atIdx + 1);
  if (eqIdx !== -1) return null;
  const tagName = trimmed.slice(0, atIdx).trim();
  const attrName = trimmed.slice(atIdx + 1).trim();
  if (!tagName || !attrName) return null;
  return { tagName, attrName };
}

export function buildAttrGroupKey(tagName: string, attrName: string): string {
  return `${tagName}_${attrName}`;
}

export function buildExtractSpecKey(tagName: string, attrName: string): string {
  return `${tagName}@${attrName}`;
}

export function sortAttrValues(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

export function parseCompositeKey(key: string): { tagName: string; attrName: string; attrValue: string } | null {
  const atIdx = key.indexOf('@');
  if (atIdx === -1) return null;
  const eqIdx = key.indexOf('=', atIdx + 1);
  if (eqIdx === -1) return null;
  const tagName = key.slice(0, atIdx);
  const attrName = key.slice(atIdx + 1, eqIdx);
  const attrValue = key.slice(eqIdx + 1);
  if (!tagName || !attrName) return null;
  return { tagName, attrName, attrValue };
}

function isValidOpenTagPrefixMatch(source: string, startIdx: number, prefixLen: number): boolean {
  if (startIdx > 0 && source[startIdx - 1] === '/') return false;
  const ch = source[startIdx + prefixLen];
  if (ch === undefined) return true;
  if (ch === '>' || ch === '=') return true;
  if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') return true;
  if (/[A-Za-z0-9_-]/.test(ch)) return false;
  return true;
}

function findOpenTagAt(source: string, tagName: string, fromIndex: number): number {
  const prefix = `<${tagName}`;
  const lowerSource = source.toLowerCase();
  const lowerPrefix = prefix.toLowerCase();
  let idx = fromIndex;
  while (idx < source.length) {
    const found = lowerSource.indexOf(lowerPrefix, idx);
    if (found === -1) return -1;
    if (isValidOpenTagPrefixMatch(source, found, prefix.length)) return found;
    idx = found + 1;
  }
  return -1;
}

function findOpenTagEnd(source: string, openStart: number): number {
  return source.indexOf('>', openStart);
}

function findCloseTag(source: string, tagName: string, afterOpenEnd: number): number {
  const close = `</${tagName}>`;
  return source.toLowerCase().indexOf(close.toLowerCase(), afterOpenEnd);
}

export function parseOpenTagAttributes(openTag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const inner = openTag.replace(/^<[\w-]+/i, '').replace(/>$/, '').trim();
  if (!inner) return attrs;
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[name.toLowerCase()] = value;
  }
  return attrs;
}

export type TagInstance = {
  fullBlock: string;
  inner: string;
  attrs: Record<string, string>;
};

export function findAllTagInstances(text: string, tagName: string): TagInstance[] {
  const source = String(text ?? '');
  if (!source || !tagName) return [];
  const instances: TagInstance[] = [];
  let searchFrom = 0;
  const closeTagLen = `</${tagName}>`.length;

  while (searchFrom < source.length) {
    const openStart = findOpenTagAt(source, tagName, searchFrom);
    if (openStart === -1) break;
    const openEnd = findOpenTagEnd(source, openStart);
    if (openEnd === -1) break;
    const closeStart = findCloseTag(source, tagName, openEnd + 1);
    if (closeStart === -1) break;
    const closeEnd = closeStart + closeTagLen;
    const openTag = source.slice(openStart, openEnd + 1);
    const inner = source.slice(openEnd + 1, closeStart);
    instances.push({
      fullBlock: source.slice(openStart, closeEnd),
      inner,
      attrs: parseOpenTagAttributes(openTag),
    });
    searchFrom = closeEnd;
  }
  return instances;
}

function extractLastTagContentLiteral(text: string, tagName: string): string | null {
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

function extractBareTagLastInner(text: string, tagName: string): string | null {
  const instances = findAllTagInstances(text, tagName);
  if (!instances.length) {
    return extractLastTagContentLiteral(text, tagName);
  }
  return instances[instances.length - 1].inner.trim();
}

function extractByAttrSpec(text: string, spec: ExtractTagSpec): Record<string, string> {
  const result: Record<string, string> = {};
  const instances = findAllTagInstances(text, spec.tagName);
  for (const inst of instances) {
    const attrValue = spec.attrName ? inst.attrs[spec.attrName.toLowerCase()] : undefined;
    const key =
      attrValue !== undefined && attrValue !== ''
        ? buildCompositeKey(spec.tagName, spec.attrName!, attrValue)
        : spec.tagName;
    result[key] = inst.fullBlock.trim();
  }
  return result;
}

export interface InjectTagExtractionResult {
  extractedTags: Record<string, string>;
  injectedFragments: string[];
  resolvedKeys: string[];
}

export function getChatExtractTagSpecs(
  chatExtractTags: { user?: string[]; assistant?: string[] } | undefined,
  source: 'user' | 'assistant',
): string[] {
  const specs = chatExtractTags?.[source] ?? [];
  return specs.map(t => t.trim()).filter(Boolean);
}

export function extractInjectTagsFromResponse(
  text: string,
  extractInjectTags: string[] = [],
): InjectTagExtractionResult {
  const specs = extractInjectTags.map(t => parseExtractTagSpec(t)).filter((s): s is ExtractTagSpec => !!s);

  const extractedTags: Record<string, string> = {};
  const injectedFragments: string[] = [];
  const resolvedKeys: string[] = [];

  for (const spec of specs) {
    const configKey = spec.attrName ? `${spec.tagName}@${spec.attrName}` : spec.tagName;

    if (!spec.attrName) {
      const inner = extractBareTagLastInner(text, spec.tagName);
      if (inner === null) continue;
      extractedTags[spec.tagName] = inner;
      injectedFragments.push(`<${spec.tagName}>${inner}</${spec.tagName}>`);
      resolvedKeys.push(spec.tagName);
      continue;
    }

    const byKey = extractByAttrSpec(text, spec);
    const keys = Object.keys(byKey).sort();
    if (!keys.length) continue;
    for (const key of keys) {
      extractedTags[key] = byKey[key];
      injectedFragments.push(byKey[key]);
      resolvedKeys.push(key);
    }
    if (!resolvedKeys.includes(configKey)) {
      resolvedKeys.push(configKey);
    }
  }

  return { extractedTags, injectedFragments, resolvedKeys };
}

export function parseCompositePlaceholder(name: string): { tagName: string; attrName: string; attrValue: string } | null {
  const trimmed = name.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx === -1) return null;
  const eqIdx = trimmed.indexOf('=', atIdx + 1);
  if (eqIdx === -1) return null;
  const tagName = trimmed.slice(0, atIdx).trim();
  const attrName = trimmed.slice(atIdx + 1, eqIdx).trim();
  const attrValue = trimmed.slice(eqIdx + 1).trim();
  if (!tagName || !attrName) return null;
  return { tagName, attrName, attrValue };
}

export function compositePlaceholderToKey(name: string): string | null {
  const p = parseCompositePlaceholder(name);
  if (!p) return null;
  return buildCompositeKey(p.tagName, p.attrName, p.attrValue);
}

export const EXTRACT_INJECT_TAGS_HELP = {
  intro: '逗号分隔多个标签名。从本任务 AI 输出中摘取，写入同轮 relay 与楼层 post_process_tags。',
  modes: [
    {
      title: '裸名',
      config: 'result',
      rule: '扫描所有 <result>…</result>，只取最后一次，存内文；引用时包回 <result>…</result>。内文可含子标签（如容器内的 <npc>），引用时会保留外层标签。',
      example: '<result>旧</result><result>新</result> → key result = "新"',
    },
    {
      title: '按属性',
      config: 'item@id',
      rule: '扫描所有 <item …>，按 id 属性分成 item@id=值，存完整标签块；缺 id 时回退裸 key item；同 key 后者覆盖。',
      example: '<item id="1">A</item><item id="2">B</item> → item@id=1、item@id=2',
    },
  ],
  dynamicPlaceholders: {
    title: '动态属性占位符',
    intro:
      '配置「标签@属性」（如 item@id）后，AI 须输出带该属性的开标签（如 <item id="1">…</item>）。摘取结果写入 relay key item@id=1、item@id=2…，并同步到楼层变量 post_process_tags.item_id.1 等嵌套结构。',
    tips: [
      {
        code: '{{item@id}}',
        desc: '动态（无 = 值）：在注入模板或提示词中批量展开全部 item@id=* 实例；副本族任务的提示词须使用此种形式。',
      },
      {
        code: '{{item@id=1}}',
        desc: '精确（带 = 值）：只展开单个实例，适合固定引用某一属性值。',
      },
      {
        code: '{{item}}',
        desc: '展开裸 key item 与全部 item@id=* 实例。',
      },
      {
        desc: '引用时输出完整标签块，保留原始属性，避免双重包裹。',
      },
    ],
  },
  replicaFamily: {
    title: '副本族（与动态占位符联动）',
    intro:
      '当某一阶段需要对「上一阶段枚举出的多个属性实例」分别调用 API 时，可将该任务设为副本族：原本仅保存提示词模板，运行时按 relay 自动生成 N 个副本并并行执行。',
    steps: [
      {
        title: '1. 上一阶段枚举',
        desc: '在较早阶段的任务「提取写入标签」中配置 item@id（或其它 标签@属性），让 AI 输出多个带属性值的标签块，写入 relay。',
      },
      {
        title: '2. 配置副本族任务',
        desc: '本任务提示词中含且仅含一种动态占位符（如 {{item@id}}，不带 = 值）。可与 {{result}}、$7 等其它占位符并存，但不能同时出现两种 {{tag@attr}}。',
      },
      {
        title: '3. 启用任务',
        desc: '勾选「启用」后任务标记为「副本族」。原本不参与 API 调用，仅作为模板；UI 中自动生成的副本 tab 会隐藏。',
      },
      {
        title: '4. 运行时同步',
        desc: '进入该执行阶段前，读取上一阶段 relay 中的 item@id=* 列表，按数量生成副本「基名 属性值」（如「副本族处理 1」「副本族处理 2」），各副本提示词中的 {{item@id}} 会替换为 {{item@id=1}} 等精确形式后并行调用 API。',
      },
    ],
    notes: [
      '上一阶段 relay 无可用属性实例时，整组副本族跳过。',
      '关闭「启用」会删除已生成的副本并取消副本族标记。',
      '选中副本族原本后，可通过任务 tab 下方的副本族切换条预览各副本提示词。',
    ],
    example:
      'S1「枚举 item」（提取写入标签 item@id）→ S2「副本族处理」（提示词 {{item@id}}，启用副本族）→ 运行时生成「副本族处理 1」「副本族处理 2」… 并行执行',
  },
  relay:
    '同轮 relay 优先；提示词与聊天注入在 relay 缺省时从 post_process_tags 回退（不限于提取写入标签白名单）。副本族在进入该阶段前同步读取上一阶段 relay 中的 标签@属性=* 列表。重跑后处理任务读上一楼。供「消息楼层标签变量注入」与「聊天注入设置」中显式占位符使用。',
} as const;
