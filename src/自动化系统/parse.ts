import {
  CATEGORY_META,
  type AttrMap,
  type CategorySection,
  type ChronicleData,
  type InteractionEvent,
  type NpcCard,
  type NpcCategoryKey,
  type PreviewData,
  type WealthClass,
} from './types';

/** 去掉 HTML 注释 */
export function stripComments(text: string): string {
  return String(text ?? '').replace(/<!--[\s\S]*?-->/g, '');
}

export function softTrim(text: string): string {
  return String(text ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 解析开标签属性。支持中英属性名。 */
export function parseAttrs(openTag: string): AttrMap {
  const attrs: AttrMap = {};
  const mTag = openTag.match(/^<\s*([^\s/>]+)([\s\S]*?)\/?>$/);
  if (!mTag) return attrs;
  const rest = mTag[2] ?? '';

  const re = /([\u4e00-\u9fff\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type TagHit = {
  openTag: string;
  attrs: AttrMap;
  inner: string;
  full: string;
};

/** 找出所有成对或自闭合标签实例 */
export function findAllPairs(source: string, tagName: string): TagHit[] {
  const text = String(source ?? '');
  if (!text || !tagName) return [];
  const openRe = new RegExp(`<\\s*${escapeRegExp(tagName)}(?=[\\s/>])([^>]*)>`, 'gi');
  const closeToken = `</${tagName}>`;
  const hits: TagHit[] = [];
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(text)) !== null) {
    const openEnd = openRe.lastIndex;
    const openTag = m[0];
    if (/\/\s*>$/.test(openTag)) {
      hits.push({
        openTag,
        attrs: parseAttrs(openTag),
        inner: '',
        full: openTag,
      });
      continue;
    }
    const closeIdx = text.toLowerCase().indexOf(closeToken.toLowerCase(), openEnd);
    if (closeIdx === -1) continue;
    const inner = text.slice(openEnd, closeIdx);
    const full = text.slice(m.index, closeIdx + closeToken.length);
    hits.push({
      openTag,
      attrs: parseAttrs(openTag),
      inner,
      full,
    });
    openRe.lastIndex = closeIdx + closeToken.length;
  }
  return hits;
}

function fieldLine(text: string, label: string): string {
  const re = new RegExp(`${escapeRegExp(label)}\\s*[:：]\\s*(.+?)(?:\\n|$)`, 'i');
  const m = text.match(re);
  return m ? softTrim(m[1]) : '';
}

function splitPipe(raw: string): string[] {
  return raw
    .split(/\s*[|¦]\s*/)
    .map(s => softTrim(s))
    .filter(Boolean);
}

function splitMemories(raw: string): string[] {
  return raw
    .split(/[;；]/)
    .map(s => softTrim(s.replace(/^\d+[.、.)．]\s*/, '')))
    .filter(Boolean);
}

function emptyNpc(name: string): NpcCard {
  return {
    name,
    actionChain: [],
    predict: '',
    debutReady: false,
    statusParts: [],
    wealth: '',
    longGoal: '',
    nearPlan: [],
    relatedEvent: '',
    recentMemories: [],
    settledMemories: [],
    coreMemories: [],
    empty: true,
  };
}

/** 解析单个 npc 内文（可含或不含外层 <npc> 标签） */
export function parseNpcBlock(text: string, fallbackName = ''): NpcCard {
  const raw = stripComments(String(text ?? ''));
  const npc = emptyNpc(fallbackName);
  npc.empty = false;

  const wrapped = findAllPairs(raw, 'npc');
  let body = raw;
  if (wrapped.length) {
    const hit = wrapped[0]!;
    const act = hit.attrs.act?.trim() || fallbackName;
    npc.name = act;
    body = hit.inner;
  } else {
    const nameMatch = raw.match(/<npc\s+act\s*=\s*["']?([^"'>]+)["']?\s*>/i);
    if (nameMatch) npc.name = softTrim(nameMatch[1] ?? '');
    else if (fallbackName) npc.name = fallbackName;
  }

  const chainRaw = fieldLine(body, '行为链');
  if (chainRaw) {
    const predictSplit = chainRaw.split(/→\s*后续预测\s*[:：]\s*/i);
    if (predictSplit.length >= 2) {
      const actionsPart = predictSplit[0] ?? '';
      const predictPart = predictSplit.slice(1).join('后续预测:');
      npc.debutReady = /(?:\*\*)?\[准备登场\](?:\*\*)?/i.test(predictPart);
      npc.predict = softTrim(predictPart.replace(/(?:\*\*)?\[准备登场\](?:\*\*)?/gi, ''));
      npc.actionChain = actionsPart
        .split(/→/)
        .map(s => softTrim(s))
        .filter(Boolean);
    } else {
      npc.actionChain = chainRaw
        .split(/→/)
        .map(s => softTrim(s))
        .filter(Boolean);
    }
  }

  const statusRaw = fieldLine(body, '当前状态');
  if (statusRaw) npc.statusParts = splitPipe(statusRaw);

  npc.wealth = fieldLine(body, '资金状况');
  npc.longGoal = fieldLine(body, '长期目标');

  const planRaw = fieldLine(body, '近期打算');
  if (planRaw) npc.nearPlan = splitPipe(planRaw);

  const eventMatch = body.match(/关联事件\s*[:：]\s*\[([^\]]*)\]/);
  if (eventMatch) npc.relatedEvent = softTrim(eventMatch[1] ?? '');
  else {
    const eventLine = fieldLine(body, '关联事件');
    if (eventLine) {
      const bracket = eventLine.match(/\[([^\]]*)\]/);
      npc.relatedEvent = bracket ? softTrim(bracket[1] ?? '') : eventLine;
    }
  }

  const recent = fieldLine(body, '近期记忆');
  if (recent) npc.recentMemories = splitMemories(recent);
  const settled = fieldLine(body, '沉淀记忆');
  if (settled) npc.settledMemories = splitMemories(settled);
  const core = fieldLine(body, '核心记忆');
  if (core) npc.coreMemories = splitMemories(core);

  // 兼容旧「关键记忆」单行
  if (!npc.recentMemories.length && !npc.settledMemories.length && !npc.coreMemories.length) {
    const legacy = fieldLine(body, '关键记忆');
    if (legacy) npc.recentMemories = splitMemories(legacy);
  }

  if (!npc.name) npc.name = fallbackName;
  if (!npc.name && !npc.actionChain.length && !npc.wealth && !npc.longGoal) {
    npc.empty = true;
  }
  return npc;
}

/** 拆分角色列表字符串 */
export function splitNameList(raw: string): string[] {
  return String(raw ?? '')
    .split(/[,，、;；|/]+/)
    .map(s => softTrim(s))
    .filter(Boolean);
}

/** 解析 <后台角色交互预演> 内文（可含或不含外层标签） */
export function parsePreview(text: string): PreviewData {
  const raw = stripComments(String(text ?? ''));
  const result: PreviewData = {
    startTime: '',
    endTime: '',
    timeBadge: '',
    relationNames: [],
    plotNames: [],
    worldNames: [],
    interactions: [],
  };

  let body = raw;
  const root = findAllPairs(raw, '后台角色交互预演');
  if (root.length) body = root[0]!.inner;

  const starts = findAllPairs(body, '起始时间');
  if (starts.length) result.startTime = softTrim(starts[0]!.attrs.time ?? '');
  const ends = findAllPairs(body, '结束时间');
  if (ends.length) result.endTime = softTrim(ends[0]!.attrs.time ?? '');

  if (result.startTime && result.endTime) {
    result.timeBadge = `${result.startTime} — ${result.endTime}`;
  } else {
    result.timeBadge = result.startTime || result.endTime;
  }

  const roleSets = findAllPairs(body, '角色集');
  for (const hit of roleSets) {
    const type = softTrim(hit.attrs['类型'] ?? hit.attrs.type ?? '');
    const list = splitNameList(hit.attrs['列表'] ?? hit.attrs.list ?? '');
    if (type.includes('关系')) result.relationNames = list;
    else if (type.includes('剧情')) result.plotNames = list;
    else if (type.includes('时局')) result.worldNames = list;
  }

  const interactions = findAllPairs(body, '交互');
  for (const hit of interactions) {
    const id = softTrim(hit.attrs['编号'] ?? hit.attrs.id ?? '');
    const roles = splitNameList(hit.attrs['角色'] ?? hit.attrs.roles ?? '');
    const summary = fieldLine(hit.inner, '简述');
    const resultLine = fieldLine(hit.inner, '结果');
    if (!id && !roles.length && !summary && !resultLine) continue;
    result.interactions.push({
      id: id || `E${String(result.interactions.length + 1).padStart(3, '0')}`,
      roles,
      summary,
      result: resultLine,
    } satisfies InteractionEvent);
  }

  return result;
}

export function getWealthClass(wealth: string): WealthClass {
  const w = String(wealth ?? '');
  if (/一贫如洗|赤贫|destitute/i.test(w)) return 'wealth-destitute';
  if (/勉强糊口|贫困|poor/i.test(w)) return 'wealth-poor';
  if (/手头拮据|拮据|tight/i.test(w)) return 'wealth-tight';
  if (/收支平衡|平衡|balanced/i.test(w)) return 'wealth-balanced';
  if (/略有盈余|盈余|comfortable/i.test(w)) return 'wealth-comfortable';
  if (/手头宽裕|宽裕|well.?off/i.test(w)) return 'wealth-welloff';
  if (/富甲天下|tycoon|magnate/i.test(w)) return 'wealth-tycoon';
  if (/富足有余|富裕|rich|wealthy/i.test(w)) return 'wealth-rich';
  return 'wealth-balanced';
}

export function getWealthEmoji(wealth: string): string {
  const cls = getWealthClass(wealth);
  const map: Record<WealthClass, string> = {
    'wealth-destitute': '💀',
    'wealth-poor': '🪙',
    'wealth-tight': '💰',
    'wealth-balanced': '💵',
    'wealth-comfortable': '💎',
    'wealth-welloff': '🏦',
    'wealth-rich': '👑',
    'wealth-tycoon': '🏰',
  };
  return map[cls];
}

/**
 * 按角色集归类 NPC。同名只出现一次，优先顺序：关系 → 剧情 → 时局。
 * 名单有名但无行动数据时仍出空卡。
 */
export function buildChronicle(
  preview: PreviewData,
  npcByName: Record<string, NpcCard | string>,
): ChronicleData {
  const used = new Set<string>();

  function resolveCard(name: string): NpcCard {
    const raw = npcByName[name];
    if (raw == null) return emptyNpc(name);
    if (typeof raw === 'string') {
      const card = parseNpcBlock(raw, name);
      if (!card.name) card.name = name;
      return card;
    }
    return { ...raw, name: raw.name || name };
  }

  function buildSection(key: NpcCategoryKey, names: string[]): CategorySection {
    const meta = CATEGORY_META[key];
    const uniqueNames: string[] = [];
    for (const n of names) {
      if (!n || used.has(n)) continue;
      used.add(n);
      uniqueNames.push(n);
    }
    return {
      key,
      typeLabel: meta.typeLabel,
      badge: meta.badge,
      icon: meta.icon,
      names: uniqueNames,
      npcs: uniqueNames.map(resolveCard),
    };
  }

  return {
    timeBadge: preview.timeBadge,
    sections: [
      buildSection('relation', preview.relationNames),
      buildSection('plot', preview.plotNames),
      buildSection('world', preview.worldNames),
    ],
    interactions: preview.interactions,
  };
}

export function isChronicleEmpty(data: ChronicleData | null | undefined): boolean {
  if (!data) return true;
  const hasNpcs = data.sections.some(s => s.npcs.length > 0);
  const hasIx = data.interactions.length > 0;
  return !hasNpcs && !hasIx;
}
