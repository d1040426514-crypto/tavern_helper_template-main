import {
  CATEGORY_META,
  type AttrMap,
  type CategorySection,
  type ChronicleBuildInput,
  type ChronicleData,
  type InteractionEvent,
  type NpcCard,
  type NpcCategoryKey,
  type NpcLifeArchive,
  type NpcSocialPerson,
  type QuestArchiveEntry,
  type QuestItem,
  type QuestItemStatus,
  type QuestLog,
  type QuestTaskStatus,
  type ReputationClass,
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

function lineIndent(line: string): number {
  const m = line.match(/^[ \t]*/);
  return m ? m[0].length : 0;
}

type FieldSection = {
  /** 标题行冒号后的同行文字 */
  inline: string;
  /** 标题之下、缩进更深的正文 */
  body: string;
};

/** 按缩进切出一个字段。只取第一次出现，正文到缩进不再更深为止。 */
function readSection(text: string, label: string): FieldSection | null {
  const lines = String(text ?? '').split(/\r?\n/);
  const re = new RegExp(`^([ \\t]*)${escapeRegExp(label)}\\s*[:：]\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const matched = lines[i]?.match(re);
    if (!matched) continue;
    const headerIndent = (matched[1] ?? '').length;
    const child: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? '';
      if (!line.trim()) {
        child.push(line);
        continue;
      }
      if (lineIndent(line) <= headerIndent) break;
      child.push(line);
    }
    return { inline: softTrim(matched[2] ?? ''), body: child.join('\n') };
  }
  return null;
}

function nestedInline(parent: FieldSection | null, label: string): string | null {
  if (!parent) return null;
  const child = readSection(parent.body, label);
  if (!child) return null;
  return child.inline;
}

function splitPipe(raw: string): string[] {
  return raw
    .split(/\s*[|¦]\s*/)
    .map(s => softTrim(s))
    .filter(Boolean);
}

/**
 * 拆分记忆条目。
 * 支持 `1.a;2.b`，以及无分号的连写 `1.a。2.b。3.c` / `1、a 2、b`。
 */
export function splitMemories(raw: string): string[] {
  const text = softTrim(String(raw ?? ''));
  if (!text) return [];

  /** 下一条序号前拆分：2. / 2、 / 2) ，序号后需空白或中文/引号/字母 */
  const numberedBoundary =
    /(?=\d{1,2}[.、.)．](?:\s|(?=[\u4e00-\u9fff「『“A-Za-z])))/;

  let parts = text
    .split(/[;；]+/)
    .map(s => softTrim(s))
    .filter(Boolean);
  if (!parts.length) parts = [text];

  parts = parts.flatMap(part => {
    const pieces = part
      .split(numberedBoundary)
      .map(s => softTrim(s))
      .filter(Boolean);
    if (pieces.length <= 1) return [part];
    const numbered = pieces.filter(p => /^\d{1,2}[.、.)．]/.test(p));
    return numbered.length >= 2 ? pieces : [part];
  });

  return parts
    .map(s => softTrim(s.replace(/^\d{1,2}[.、.)．]\s*/, '')))
    .filter(Boolean);
}

function parseReputation(raw: string): NpcCard['reputation'] {
  if (!raw) return [];
  const out: NpcCard['reputation'] = [];
  for (const part of splitPipe(raw)) {
    const m = part.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (m) {
      out.push({ label: softTrim(m[1] ?? ''), value: softTrim(m[2] ?? '') });
    } else if (part) {
      out.push({ label: '', value: part });
    }
  }
  return out.filter(r => r.value);
}

function blankPerson(name: string, note = ''): NpcSocialPerson {
  return { name, note, warmth: '', attitude: '' };
}

/**
 * 分类用 `|` 分隔，分类内关系人用 `;` 分隔。
 * 亦兼容 `;[分类]人名`（漏写 `|` 时仍切换分类）。
 */
function parseGroupedPeople(raw: string): NpcCard['socialNetwork'] {
  if (!raw) return [];
  const byCat = new Map<string, NpcCard['socialNetwork'][number]['people']>();
  let currentCategory = '关系';

  function pushPerson(category: string, personRaw: string) {
    const person = parsePersonChunk(personRaw);
    if (!person) return;
    const list = byCat.get(category) ?? [];
    list.push(person);
    byCat.set(category, list);
  }

  for (const catChunk of splitPipe(raw)) {
    let rest = catChunk;
    const catMatch = rest.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (catMatch) {
      currentCategory = softTrim(catMatch[1] ?? '') || '关系';
      rest = softTrim(catMatch[2] ?? '');
    }
    if (!rest) continue;

    for (const personRaw of rest
      .split(/[;；]/)
      .map(s => softTrim(s))
      .filter(Boolean)) {
      const nested = personRaw.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (nested) {
        currentCategory = softTrim(nested[1] ?? '') || currentCategory;
        pushPerson(currentCategory, nested[2] ?? '');
      } else {
        pushPerson(currentCategory, personRaw);
      }
    }
  }

  const groups: NpcCard['socialNetwork'] = [];
  for (const [category, people] of byCat) {
    if (people.length) groups.push({ category, people });
  }
  return groups;
}

function parsePersonChunk(personRaw: string): NpcSocialPerson | null {
  const text = softTrim(personRaw);
  if (!text || text === '无') return null;
  const pm = text.match(/^(.+?)\s*[（(]\s*(.*?)\s*[）)]\s*$/);
  const person = pm ? blankPerson(softTrim(pm[1] ?? ''), softTrim(pm[2] ?? '')) : blankPerson(text);
  if (!person.name) return null;
  return person;
}

const PERSON_FIELD_KEYS = ['关系', '好感', '态度'] as const;

function personFieldKey(line: string): { key: (typeof PERSON_FIELD_KEYS)[number]; value: string } | null {
  const matched = line.match(/^(关系|好感|态度)\s*[:：]\s*(.*)$/);
  if (!matched) return null;
  const key = matched[1] as (typeof PERSON_FIELD_KEYS)[number];
  const value = softTrim(matched[2] ?? '');
  return { key, value: value === '无' ? '' : value };
}

function applyPersonField(person: NpcSocialPerson, key: (typeof PERSON_FIELD_KEYS)[number], value: string) {
  if (key === '关系') person.note = value;
  else if (key === '好感') person.warmth = value;
  else person.attitude = value;
}

/** `[类别]` 单独成行。人可以是「人名(简述)」，也可以是人名下再写关系、好感、态度。 */
function parseIndentedPeople(body: string): NpcCard['socialNetwork'] {
  const groups: NpcCard['socialNetwork'] = [];
  let current: { category: string; people: NpcSocialPerson[]; indent: number } | null = null;

  for (const line of String(body ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const indent = lineIndent(line);
    const trimmed = line.trim();
    const catMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (catMatch && (!current || indent <= current.indent)) {
      current = {
        category: softTrim(catMatch[1] ?? '') || '关系',
        people: [],
        indent,
      };
      groups.push(current);
      const inlinePerson = parsePersonChunk(catMatch[2] ?? '');
      if (inlinePerson) current.people.push(inlinePerson);
      continue;
    }
    if (!current || indent <= current.indent) continue;
    if (/^互动\s*[:：]/.test(trimmed)) continue;
    const field = personFieldKey(trimmed);
    const person = current.people[current.people.length - 1];
    if (field && person) {
      applyPersonField(person, field.key, field.value);
      continue;
    }
    const next = parsePersonChunk(trimmed);
    if (next) current.people.push(next);
  }

  return groups.filter(g => g.people.length);
}

function readPeopleSection(section: FieldSection | null): NpcCard['socialNetwork'] {
  if (!section) return [];
  if (section.inline === '无') return [];
  const fromBody = parseIndentedPeople(section.body);
  if (fromBody.length) return fromBody;
  if (!section.inline) return [];
  return parseGroupedPeople(section.inline);
}

const REPUTATION_LABELS = ['官方', '民间', '暗域', '业界'] as const;

function readReputation(section: FieldSection | null): NpcCard['reputation'] {
  if (!section) return [];
  const labeled = REPUTATION_LABELS.map(label => ({
    label,
    section: readSection(section.body, label),
  }));
  if (labeled.some(item => item.section)) {
    return labeled.flatMap(item => {
      const value = softTrim(item.section?.inline ?? '');
      if (!value || value === '无') return [];
      return [{ label: item.label, value }];
    });
  }
  return parseReputation(section.inline);
}

function readMemories(section: FieldSection | null): string[] {
  if (!section) return [];
  const lines = section.body
    .split(/\r?\n/)
    .map(line => softTrim(line))
    .filter(Boolean);
  if (lines.length) return lines.flatMap(line => splitMemories(line));
  if (!section.inline || section.inline === '无') return [];
  return splitMemories(section.inline);
}

function readLifeArchive(body: string): NpcLifeArchive {
  const packed = readSection(body, '生命档案');
  const life = packed?.inline ? parseLifeArchive(packed.inline) : emptyLifeArchive();
  const source = packed?.body.trim() ? packed.body : body;
  const fields: Array<[string, keyof NpcLifeArchive]> = [
    ['生日', 'birthday'],
    ['种族', 'race'],
    ['性别', 'gender'],
    ['年龄', 'age'],
    ['剩余寿命', 'remainingLife'],
    ['特质', 'trait'],
  ];
  for (const [label, key] of fields) {
    const section = readSection(source, label);
    if (!section) continue;
    const value = softTrim(section.inline);
    life[key] = key === 'trait' && (!value || value === '无') ? '' : value;
  }
  const tier = readSection(source, '生命层级');
  if (tier) life.lifeTier = normalizeLifeTier(tier.inline);
  return life;
}

function readBackground(section: FieldSection | null): NpcCard['background'] {
  const bg = emptyBackground();
  if (!section) return bg;
  const group = nestedInline(section, '团体');
  const circle = nestedInline(section, '社交圈');
  const event = nestedInline(section, '事件');
  if (group !== null || circle !== null || event !== null) {
    bg.group = group ?? '';
    bg.circle = circle ?? '';
    bg.event = event ?? '';
    return bg;
  }
  return section.inline ? parseBackground(section.inline) : bg;
}

/** 动作、穿着、正在做的事、所处世界、位置、环境、状态。缺项留空，避免标签错位。 */
function readStatusParts(body: string): string[] {
  const place = readSection(body, '身处环境');
  const state = readSection(body, '当前状态');
  const slots = [
    nestedInline(state, '动作'),
    nestedInline(state, '穿着'),
    nestedInline(state, '正在做的事'),
    nestedInline(place, '世界'),
    nestedInline(place, '位置'),
    nestedInline(place, '环境'),
    nestedInline(state, '状态'),
  ];
  if (slots.some(value => value !== null)) {
    const filled = slots.map(value => value ?? '');
    return filled.some(value => value.trim()) ? filled : [];
  }
  if (state?.inline) return splitPipe(state.inline);
  return [];
}

/** 事件、行为、时间。缺项留空。 */
function readNearPlan(section: FieldSection | null): string[] {
  if (!section) return [];
  const slots = [
    nestedInline(section, '事件'),
    nestedInline(section, '行为'),
    nestedInline(section, '时间'),
  ];
  if (slots.some(value => value !== null)) {
    const filled = slots.map(value => value ?? '');
    return filled.some(value => value.trim()) ? filled : [];
  }
  return section.inline ? splitPipe(section.inline) : [];
}

function parseBackground(raw: string): NpcCard['background'] {
  const bg: NpcCard['background'] = { group: '', circle: '', event: '' };
  if (!raw) return bg;
  const group = raw.match(/\[团体\]\s*([^|[\]]*)/);
  const circle = raw.match(/\[社交圈\]\s*([^|[\]]*)/);
  const event = raw.match(/\[事件\]\s*([^|[\]]*)/);
  if (group) bg.group = softTrim(group[1] ?? '');
  if (circle) bg.circle = softTrim(circle[1] ?? '');
  if (event) bg.event = softTrim(event[1] ?? '');
  return bg;
}

function emptyLifeArchive(): NpcLifeArchive {
  return { birthday: '', race: '', gender: '', age: '', remainingLife: '', lifeTier: '', trait: '' };
}

/** 「无」、空白或空括号视为未写；层级名后的空括号去掉。 */
function normalizeLifeTier(raw: string): string {
  let text = softTrim(raw);
  if (!text || text === '无') return '';
  text = softTrim(text.replace(/[（(]\s*[)）]\s*$/u, ''));
  if (!text || text === '无') return '';
  return text;
}

function parseLifeArchive(raw: string): NpcLifeArchive {
  const life = emptyLifeArchive();
  if (!raw) return life;
  const birthday = raw.match(/\[生日\]\s*([^|[\]]*)/);
  const race = raw.match(/\[种族\]\s*([^|[\]]*)/);
  const gender = raw.match(/\[性别\]\s*([^|[\]]*)/);
  const age = raw.match(/\[年龄\]\s*([^|[\]]*)/);
  const remaining = raw.match(/\[剩余寿命\]\s*([^|[\]]*)/);
  const tier = raw.match(/\[生命层级\]\s*([^|[\]]*)/);
  if (birthday) life.birthday = softTrim(birthday[1] ?? '');
  if (race) life.race = softTrim(race[1] ?? '');
  if (gender) life.gender = softTrim(gender[1] ?? '');
  if (age) life.age = softTrim(age[1] ?? '');
  if (remaining) life.remainingLife = softTrim(remaining[1] ?? '');
  if (tier) life.lifeTier = normalizeLifeTier(tier[1] ?? '');
  return life;
}

function emptyBackground(): NpcCard['background'] {
  return { group: '', circle: '', event: '' };
}

function leadingIndent(line: string): number {
  const m = line.match(/^[ \t]*/);
  return m ? m[0]!.length : 0;
}

function stripQuestMarker(line: string): { status: QuestItemStatus | 'climax' | null; text: string } {
  const trimmed = line.replace(/^[ \t]+/, '');
  if (/^☑/.test(trimmed)) return { status: 'done', text: softTrim(trimmed.replace(/^☑\s*/, '')) };
  if (/^▶/.test(trimmed)) return { status: 'active', text: softTrim(trimmed.replace(/^▶\s*/, '')) };
  if (/^☐/.test(trimmed)) return { status: 'todo', text: softTrim(trimmed.replace(/^☐\s*/, '')) };
  if (/^📅/.test(trimmed)) return { status: 'climax', text: softTrim(trimmed.replace(/^📅\s*/, '')) };
  return { status: null, text: softTrim(trimmed) };
}

/** 解析单个 <quest_log> 内文；无标题则返回 null */
export function parseQuestLog(inner: string): QuestLog | null {
  const text = softTrim(String(inner ?? ''));
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  let kind = '';
  let title = '';
  let taskStatus: QuestTaskStatus = '';
  let summary = '';
  let pauseReason = '';
  let resumeCondition = '';
  let climax = '';
  const items: QuestItem[] = [];
  let lastTop: QuestItem | null = null;
  let lastTopIndent = 0;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;

    if (!kind && !title) {
      const head = rawLine.trim().match(/^【([^】]+)】\s*(.*)$/);
      if (head) {
        kind = softTrim(head[1] ?? '');
        title = softTrim(head[2] ?? '');
        continue;
      }
    }

    const fieldMatch = rawLine.match(/^\s*(任务状态|任务简述|搁置原因|恢复条件)\s*[:：]\s*(.*)$/i);
    if (fieldMatch) {
      const label = softTrim(fieldMatch[1] ?? '');
      const value = softTrim(fieldMatch[2] ?? '');
      if (label === '任务状态') {
        if (value === '活跃') taskStatus = 'active';
        else if (value === '搁置') taskStatus = 'shelved';
      } else if (label === '任务简述') {
        summary = value;
      } else if (label === '搁置原因') {
        pauseReason = value;
      } else if (label === '恢复条件') {
        resumeCondition = value;
      }
      continue;
    }

    const indent = leadingIndent(rawLine);
    const { status, text: itemText } = stripQuestMarker(rawLine);
    if (!status || !itemText) continue;

    if (status === 'climax') {
      climax = itemText;
      continue;
    }

    const node: QuestItem = { status, text: itemText, children: [] };
    if (lastTop && status === 'todo' && indent > lastTopIndent) {
      lastTop.children.push(node);
      continue;
    }

    items.push(node);
    lastTop = node;
    lastTopIndent = indent;
  }

  if (!kind && !title) return null;
  return {
    kind,
    title,
    status: taskStatus,
    summary,
    pauseReason,
    resumeCondition,
    items,
    climax,
  };
}

/** 解析 <quest_archive> 内文；最多 5 条 */
export function parseQuestArchive(inner: string): QuestArchiveEntry[] {
  const text = softTrim(String(inner ?? ''));
  if (!text) return [];

  const entries: QuestArchiveEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^【([^】]+)】\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);
    if (!m) continue;
    entries.push({
      kind: softTrim(m[1] ?? ''),
      title: softTrim(m[2] ?? ''),
      completedAt: softTrim(m[3] ?? ''),
      ending: softTrim(m[4] ?? ''),
    });
    if (entries.length >= 5) break;
  }
  return entries;
}

function emptyNpc(name: string): NpcCard {
  return {
    name,
    actionChain: [],
    predict: '',
    debutReady: false,
    statusParts: [],
    wealth: '',
    reputation: [],
    socialIdentity: [],
    socialNetwork: [],
    companions: [],
    background: emptyBackground(),
    lifeArchive: emptyLifeArchive(),
    longGoal: '',
    nearPlan: [],
    recentMemories: [],
    settledMemories: [],
    coreMemories: [],
    questLogs: [],
    questArchive: [],
    empty: true,
  };
}

function hasLifeArchive(life: NpcLifeArchive): boolean {
  return !!(
    life.birthday ||
    life.race ||
    life.gender ||
    life.age ||
    life.remainingLife ||
    life.lifeTier ||
    life.trait
  );
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

  const statusRaw = readStatusParts(body);
  if (statusRaw.length) npc.statusParts = statusRaw;

  npc.lifeArchive = readLifeArchive(body);
  npc.wealth = fieldLine(body, '资金状况');
  npc.reputation = readReputation(readSection(body, '声誉'));
  npc.socialIdentity = fieldLine(body, '社会身份')
    .split(/[;；]+/)
    .map(s => softTrim(s))
    .filter(Boolean);
  npc.socialNetwork = readPeopleSection(readSection(body, '社交网络'));
  const peopleSection = readSection(body, '现场人物') ?? readSection(body, '身边人物');
  npc.companions = readPeopleSection(peopleSection);
  npc.background = readBackground(readSection(body, '背景关联'));
  npc.longGoal = fieldLine(body, '长期目标');

  const planRaw = readNearPlan(readSection(body, '近期打算'));
  if (planRaw.length) npc.nearPlan = planRaw;

  npc.recentMemories = readMemories(readSection(body, '近期记忆'));
  npc.settledMemories = readMemories(readSection(body, '沉淀记忆'));
  npc.coreMemories = readMemories(readSection(body, '核心记忆'));

  const questLogs: QuestLog[] = [];
  for (const hit of findAllPairs(body, 'quest_log')) {
    const log = parseQuestLog(hit.inner);
    if (log) questLogs.push(log);
  }
  npc.questLogs = questLogs;

  const archiveHits = findAllPairs(body, 'quest_archive');
  if (archiveHits.length) {
    npc.questArchive = parseQuestArchive(archiveHits[archiveHits.length - 1]!.inner);
  }

  if (!npc.name) npc.name = fallbackName;
  const hasBg =
    !!npc.background.group || !!npc.background.circle || !!npc.background.event;
  const hasQuest = npc.questLogs.length > 0 || npc.questArchive.length > 0;
  if (
    !npc.name &&
    !npc.actionChain.length &&
    !npc.wealth &&
    !npc.longGoal &&
    !npc.reputation.length &&
    !npc.socialNetwork.length &&
    !npc.companions.length &&
    !hasLifeArchive(npc.lifeArchive) &&
    !hasBg &&
    !hasQuest
  ) {
    npc.empty = true;
  }
  return npc;
}

/** 拆分角色列表字符串（逗号/顿号等） */
export function splitNameList(raw: string): string[] {
  return String(raw ?? '')
    .split(/[,，、;；|/]+/)
    .map(s => softTrim(s))
    .filter(Boolean);
}

/**
 * 从 <后台角色交互预演> 仅抽取 <交互> 列表（可含或不含外层标签）。
 * 不再解析角色集与起止时间。
 */
export function parseInteractions(text: string): InteractionEvent[] {
  const raw = stripComments(String(text ?? ''));
  if (!raw.trim()) return [];

  let body = raw;
  const root = findAllPairs(raw, '后台角色交互预演');
  if (root.length) body = root[0]!.inner;

  const out: InteractionEvent[] = [];
  for (const hit of findAllPairs(body, '交互')) {
    const id = softTrim(hit.attrs['编号'] ?? hit.attrs.id ?? '');
    const roles = splitNameList(hit.attrs['角色'] ?? hit.attrs.roles ?? '');
    const summary = fieldLine(hit.inner, '简述');
    const resultLine = fieldLine(hit.inner, '结果');
    if (!id && !roles.length && !summary && !resultLine) continue;
    out.push({
      id: id || `E${String(out.length + 1).padStart(3, '0')}`,
      roles,
      summary,
      result: resultLine,
    });
  }
  return out;
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
    'wealth-rich': '🏰',
    'wealth-tycoon': '👑',
  };
  return map[cls];
}

export function getReputationClass(value: string): ReputationClass {
  const v = String(value ?? '');
  if (/天怒人怨/.test(v)) return 'rep-hated';
  if (/声名狼藉/.test(v)) return 'rep-infamous';
  if (/默默无闻/.test(v)) return 'rep-obscure';
  if (/小有名气/.test(v)) return 'rep-known';
  if (/受人尊敬/.test(v)) return 'rep-respected';
  if (/万众敬仰/.test(v)) return 'rep-revered';
  return 'rep-default';
}

/**
 * 按前台/后台名单归类 NPC。同名只出现一次，优先前台。
 * 名单有名但无行动数据时仍出空卡。
 */
export function buildChronicle(
  input: ChronicleBuildInput,
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
    sections: [
      buildSection('front', input.frontNames),
      buildSection('back', input.backNames),
    ],
    interactions: input.interactions ?? [],
  };
}

export function isChronicleEmpty(data: ChronicleData | null | undefined): boolean {
  if (!data) return true;
  const hasNpcs = data.sections.some(s => s.npcs.length > 0);
  const hasIx = data.interactions.length > 0;
  return !hasNpcs && !hasIx;
}
