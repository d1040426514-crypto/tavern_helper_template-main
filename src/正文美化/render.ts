import {
  absolutizeAvatarUrl,
  invalidateAvatarCache,
  loadAvatarIndex,
  type AvatarIndex,
} from './avatar';
import {
  classifyParagraph,
  extractGametxt,
  firstGrapheme,
  groupLineRanges,
  matchInnerVoice,
  normalizeKey,
  parseDialogue,
  planBeautify,
  type BeautifyPlan,
  type InnerVoice,
} from './parse';
import { DEFAULT_ASSISTANT_BEAUTIFY_LIMIT, getAssistantBeautifyLimit } from './settings';

/** 结构级安全跳过；业务前端类名不再枚举，正文只取 mes_text 直接子级 p。 */
const SKIP =
  'iframe, pre, code, script, style, textarea, .TH-render, .gametxt-dialogue, .gametxt-iv, .mes_reasoning, .mes_reasoning_details, .mes_reasoning_summary, .mes_reasoning_header, .mes_thoughts';
const AVATAR_ROWS = '.gametxt-dialogue, .gametxt-iv';

const INLINE_TAGS = new Set(['SPAN', 'EM', 'STRONG', 'B', 'I', 'Q', 'BR', 'A']);
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u00AD\u180E]/g;

/** 默认条数；实际窗口以脚本设置为准。 */
export const ASSISTANT_BEAUTIFY_LIMIT = DEFAULT_ASSISTANT_BEAUTIFY_LIMIT;

const tokens = new Map<number, number>();

type RenderHooks = {
  afterApply?: () => void;
};

let renderHooks: RenderHooks = {};

export function setRenderHooks(hooks: RenderHooks): void {
  renderHooks = hooks;
}

export function latestAssistantIds(limit = getAssistantBeautifyLimit()): number[] {
  try {
    const messages = getChatMessages('0-{{lastMessageId}}', { role: 'assistant' });
    if (!messages.length) return [];
    return messages.slice(-limit).map(message => message.message_id);
  } catch {
    return [];
  }
}

export function isInBeautifyWindow(messageId: number, limit = getAssistantBeautifyLimit()): boolean {
  return latestAssistantIds(limit).includes(messageId);
}

/** 渲染窗口内（最新 N 条 assistant）楼层。 */
export async function renderAllMessages(): Promise<void> {
  const ids = latestAssistantIds();
  await Promise.all(ids.map(id => renderMessage(id)));
}

export async function renderMessage(messageId: number): Promise<void> {
  if (!Number.isInteger(messageId) || messageId < 0) return;
  if (!isInBeautifyWindow(messageId)) return;
  const token = (tokens.get(messageId) ?? 0) + 1;
  tokens.set(messageId, token);
  try {
    const raw = getChatMessages(messageId)[0]?.message ?? '';
    const inner = extractGametxt(raw);
    if (inner == null) return;
    const plan = planBeautify(inner);
    if (!plan.paragraphs.length && !plan.innerVoices.length) return;
    const avatars = await loadAvatarIndex();
    if (tokens.get(messageId) !== token) return;
    const root = messageRoot(messageId) ?? (await waitForRoot(messageId, token));
    if (!root || tokens.get(messageId) !== token) return;
    applyPlan(root, plan, avatars);
    renderHooks.afterApply?.();
  } catch (error) {
    console.error('[正文美化] 渲染楼层失败', messageId, error);
  }
}

/** 清缓存后重刷窗口内已渲染对白头像（不改叙述结构）。 */
export async function refreshAllDialogueAvatars(): Promise<void> {
  invalidateAvatarCache();
  const avatars = await loadAvatarIndex();
  for (const id of latestAssistantIds()) {
    const root = messageRoot(id);
    if (root) syncDialogueAvatars(root, avatars);
  }
}

export function messageRoot(messageId: number): HTMLElement | null {
  const displayed = retrieveDisplayedMessage(messageId).get(0);
  if (!displayed) return null;
  if (displayed.classList.contains('mes_text')) return displayed;
  return displayed.querySelector<HTMLElement>('.mes_text');
}

async function waitForRoot(messageId: number, token: number): Promise<HTMLElement | null> {
  await new Promise(resolve => setTimeout(resolve, 300));
  if (tokens.get(messageId) !== token) return null;
  return messageRoot(messageId);
}

type SegmentKind = 'dialogue' | 'voice' | 'prose' | 'plain';

type Segment = {
  nodes: Node[];
  key: string;
  kind: SegmentKind;
  voice?: InnerVoice;
};

export function applyPlan(root: HTMLElement, plan: BeautifyPlan, avatars: AvatarIndex): void {
  unwrapInnerVoiceShells(root);
  // 脚本跑在 iframe 里，不能用本 realm 的 HTMLParagraphElement 去 instanceof 父页面节点
  const paragraphs = [...root.children].filter(
    (node): node is HTMLParagraphElement => node.nodeType === 1 && (node as Element).tagName === 'P',
  );
  for (const paragraph of paragraphs) {
    if (!paragraph.isConnected || paragraph.closest(SKIP)) continue;
    if (paragraph.dataset.gametxtBeauty === 'prose') {
      const segments = splitSegments(paragraph, plan);
      const upgrade = segments.some(segment => segment.kind === 'dialogue' || segment.kind === 'voice');
      if (!upgrade) {
        stripInvisible(paragraph);
        continue;
      }
      paragraph.classList.remove('gametxt-prose');
      delete paragraph.dataset.gametxtBeauty;
    }
    beautifyParagraph(paragraph, plan, avatars);
  }
  syncDialogueAvatars(root, avatars);
}

/** 个别配置下页面会保留 inner_voice 元素；展开后内部段落才能按直接子级 p 处理。 */
function unwrapInnerVoiceShells(root: HTMLElement): void {
  for (const shell of [...root.children].filter(node => node.tagName === 'INNER_VOICE')) {
    const hasBlock = [...shell.children].some(child => child.tagName === 'P');
    if (hasBlock) {
      shell.replaceWith(...shell.childNodes);
      continue;
    }
    const paragraph = shell.ownerDocument.createElement('p');
    paragraph.append(...shell.childNodes);
    shell.replaceWith(paragraph);
  }
}

/** 无镜译时叙述、对白、内心话常以单换行同处一个 <p>，按 <br> 切行后逐段归类。 */
function beautifyParagraph(paragraph: HTMLParagraphElement, plan: BeautifyPlan, avatars: AvatarIndex): void {
  const segments = splitSegments(paragraph, plan);
  if (segments.length <= 1) {
    const segment = segments[0];
    if (!segment) return;
    if (segment.kind === 'voice' && segment.voice) decorateInnerVoice(paragraph, segment.voice, avatars);
    else if (segment.kind === 'dialogue') decorateDialogue(paragraph, avatars);
    else if (segment.kind === 'prose') decorateProse(paragraph);
    return;
  }

  if (!segments.some(segment => segment.kind === 'dialogue' || segment.kind === 'voice')) {
    const whole = classifyParagraph(paragraph.textContent ?? '', plan);
    if (whole === 'dialogue') {
      decorateDialogue(paragraph, avatars);
      return;
    }
    if (whole === 'prose' || segments.every(segment => segment.kind === 'prose')) decorateProse(paragraph);
    return;
  }

  const doc = paragraph.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const accent = paragraph.style.color;
  let run: HTMLParagraphElement | null = null;
  let runKind: SegmentKind | null = null;
  for (const segment of segments) {
    if (segment.kind === 'prose' || segment.kind === 'plain') {
      if (!run || runKind !== segment.kind) {
        run = doc.createElement('p');
        runKind = segment.kind;
        fragment.append(run);
      } else {
        run.append(doc.createElement('br'));
      }
      run.append(...segment.nodes);
      if (segment.kind === 'prose') decorateProse(run);
      continue;
    }
    run = null;
    runKind = null;
    const holder = doc.createElement('p');
    holder.append(...segment.nodes);
    fragment.append(holder);
    if (segment.kind === 'voice' && segment.voice) {
      if (accent) holder.style.color = accent;
      decorateInnerVoice(holder, segment.voice, avatars);
    } else {
      decorateDialogue(holder, avatars);
    }
  }
  paragraph.replaceWith(fragment);
}

function splitSegments(paragraph: HTMLParagraphElement, plan: BeautifyPlan): Segment[] {
  const lines: Node[][] = [[]];
  for (const node of [...paragraph.childNodes]) {
    if (node.nodeType === 1 && (node as Element).tagName === 'BR') lines.push([]);
    else lines[lines.length - 1].push(node);
  }
  const filled = lines
    .map(nodes => ({ nodes, key: normalizeKey(nodes.map(node => node.textContent ?? '').join('')) }))
    .filter(line => line.key);

  return groupLineRanges(filled.map(line => line.key)).map(([start, end]) => {
    const group = filled.slice(start, end + 1);
    const nodes: Node[] = [];
    group.forEach((line, index) => {
      if (index > 0) nodes.push(paragraph.ownerDocument.createElement('br'));
      nodes.push(...line.nodes);
    });
    const key = group.map(line => line.key).join(' ');
    const voice = matchInnerVoice(key, plan);
    if (voice) return { nodes, key, kind: 'voice' as const, voice };
    const kind = classifyParagraph(key, plan);
    return { nodes, key, kind: kind ?? 'plain' };
  });
}

/** 重写已有对白行的头像槽，用于持久补图与状态栏即时同步。 */
export function syncDialogueAvatars(root: HTMLElement, avatars: AvatarIndex): void {
  const rows = [...root.querySelectorAll<HTMLElement>(AVATAR_ROWS)];
  for (const row of rows) {
    const name = row.dataset.gametxtName || row.querySelector('.gametxt-name')?.textContent?.trim() || '';
    const slot = row.querySelector('.gametxt-avatar');
    if (!name || !slot) continue;
    const doc = row.ownerDocument;
    const nextUrl = absolutizeAvatarUrl(avatars.urlFor(name));
    const currentImg = slot.querySelector('img.gametxt-avatar-img');
    const currentInitial = slot.querySelector('.gametxt-initial');
    if (nextUrl) {
      if (currentImg?.getAttribute('src') === nextUrl) continue;
      slot.replaceChildren(avatarNode(doc, name, nextUrl));
      continue;
    }
    const initial = firstGrapheme(name);
    if (currentInitial?.textContent === initial && !currentImg) continue;
    slot.replaceChildren(initialNode(doc, name));
  }
}

function decorateProse(paragraph: HTMLParagraphElement): void {
  stripInvisible(paragraph);
  if (!paragraph.classList.contains('gametxt-prose')) paragraph.classList.add('gametxt-prose');
  if (paragraph.dataset.gametxtBeauty !== 'prose') paragraph.dataset.gametxtBeauty = 'prose';
}

function decorateDialogue(paragraph: HTMLParagraphElement, avatars: AvatarIndex): void {
  const plain = normalizeKey(paragraph.textContent ?? '');
  const dialogue = parseDialogue(plain);
  if (!dialogue) return;
  const doc = paragraph.ownerDocument;
  const row = doc.createElement('div');
  row.className = 'gametxt-dialogue';
  row.dataset.gametxtBeauty = 'dialogue';

  const avatar = doc.createElement('div');
  avatar.className = 'gametxt-avatar';
  avatar.append(avatarNode(doc, dialogue.name, avatars.urlFor(dialogue.name)));

  const content = doc.createElement('div');
  content.className = 'gametxt-content';
  const name = doc.createElement('div');
  name.className = 'gametxt-name';
  name.textContent = dialogue.name;
  const line = doc.createElement('div');
  line.className = 'gametxt-line';
  line.innerHTML = quoteHtml(paragraph, dialogue.name, dialogue.line);

  content.append(name, line);
  row.append(avatar, content);
  paragraph.replaceWith(row);
}

/** 原生 details 折叠，不挂事件，脚本重载后旧节点照样能开合。 */
function decorateInnerVoice(paragraph: HTMLParagraphElement, voice: InnerVoice, avatars: AvatarIndex): void {
  const doc = paragraph.ownerDocument;
  const block = voiceBlock(paragraph);
  const previous = previousMeaningful(paragraph);
  if (previous?.classList.contains('gametxt-iv') && previous.dataset.gametxtVoice === String(voice.index)) {
    previous.querySelector('.gametxt-iv-body')?.append(block);
    paragraph.remove();
    return;
  }

  const card = doc.createElement('details');
  card.className = 'gametxt-iv';
  card.dataset.gametxtBeauty = 'inner-voice';
  card.dataset.gametxtName = voice.role;
  card.dataset.gametxtVoice = String(voice.index);
  const accent = paragraph.style.color;
  if (accent) card.style.setProperty('--gametxt-iv-accent', accent);

  const head = doc.createElement('summary');
  head.className = 'gametxt-iv-head';
  head.title = `${voice.role} 的心声`;

  const avatar = doc.createElement('span');
  avatar.className = 'gametxt-avatar gametxt-iv-avatar';
  avatar.append(avatarNode(doc, voice.role, avatars.urlFor(voice.role)));

  const name = doc.createElement('span');
  name.className = 'gametxt-iv-name';
  name.textContent = voice.role;

  const bubbles = doc.createElement('span');
  bubbles.className = 'gametxt-iv-bubbles';
  bubbles.setAttribute('aria-hidden', 'true');
  bubbles.append(doc.createElement('i'), doc.createElement('i'), doc.createElement('i'));

  head.append(avatar, bubbles, name);

  const body = doc.createElement('div');
  body.className = 'gametxt-iv-body';
  body.append(block);

  card.append(head, body);
  paragraph.replaceWith(card);
}

function voiceBlock(paragraph: HTMLParagraphElement): HTMLParagraphElement {
  const clone = paragraph.cloneNode(true) as HTMLElement;
  stripInvisible(clone);
  sanitizeInline(clone);
  tidyBreaks(clone);
  const block = paragraph.ownerDocument.createElement('p');
  block.innerHTML = clone.innerHTML.trim() || escapeHtml(normalizeKey(paragraph.textContent ?? ''));
  return block;
}

/** 跳过酒馆在块级标签间留下的空 <p>，找真正的上一个兄弟。 */
function previousMeaningful(node: Element): HTMLElement | null {
  let previous = node.previousElementSibling as HTMLElement | null;
  while (previous && previous.tagName === 'P' && !normalizeKey(previous.textContent ?? '')) {
    previous = previous.previousElementSibling as HTMLElement | null;
  }
  return previous;
}

function avatarNode(doc: Document, name: string, url: string): HTMLElement {
  const resolved = absolutizeAvatarUrl(url);
  if (!resolved) return initialNode(doc, name);
  const image = doc.createElement('img');
  image.className = 'gametxt-avatar-img';
  image.alt = name;
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.src = resolved;
  image.addEventListener('error', () => {
    if (!image.isConnected) return;
    image.replaceWith(initialNode(doc, name));
  });
  return image;
}

function initialNode(doc: Document, name: string): HTMLSpanElement {
  const initial = doc.createElement('span');
  initial.className = 'gametxt-initial';
  initial.textContent = firstGrapheme(name);
  return initial;
}

function quoteHtml(source: HTMLElement, name: string, line: string): string {
  const clone = source.cloneNode(true) as HTMLElement;
  stripInvisible(clone);
  while (clone.firstChild) {
    const child = clone.firstChild;
    if (child.nodeType === Node.TEXT_NODE && !(child.textContent ?? '').trim()) {
      child.remove();
      continue;
    }
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'BR') {
      child.remove();
      continue;
    }
    break;
  }
  const textNodes: Text[] = [];
  const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  const filled = () => textNodes.filter(node => node.data.trim());
  // 酒馆会把引号部分包进 <q>，说话头与开引号可能分在两个文本节点
  const head = filled()[0];
  if (head) {
    head.data = head.data.replace(
      new RegExp(`^\\s*(?:\\{${escapeRegExp(name)}\\}|｛${escapeRegExp(name)}｝)\\s*`),
      '',
    );
  }
  const open = filled()[0];
  if (open) open.data = open.data.replace(/^\s*[「“]/, '');
  const tail = filled();
  const close = tail[tail.length - 1];
  if (close) close.data = close.data.replace(/[」”]\s*$/, '');
  sanitizeInline(clone);
  tidyBreaks(clone);
  const left = normalizeKey(clone.textContent ?? '');
  if (!left || left.includes(`{${name}}`) || left.includes(`｛${name}｝`)) return escapeHtml(line);
  return clone.innerHTML.trim() || escapeHtml(line);
}

function sanitizeInline(root: HTMLElement): void {
  const elements = [...root.querySelectorAll('*')];
  for (const element of elements) {
    if (!INLINE_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'src' || name === 'href') element.removeAttribute(attr.name);
    }
  }
}

/** 去掉首尾 <br>，连续 <br> 收成一个；酒馆在换行处会留多余的 <br>。 */
function tidyBreaks(root: HTMLElement): void {
  const isBreak = (node: Node | null) => node?.nodeType === 1 && (node as Element).tagName === 'BR';
  const isBlank = (node: Node | null) => node?.nodeType === 3 && !(node.textContent ?? '').trim();
  const edge = (pick: () => Node | null) => {
    for (let node = pick(); node && (isBreak(node) || isBlank(node)); node = pick()) node.remove();
  };
  edge(() => root.firstChild);
  edge(() => root.lastChild);
  for (const br of [...root.querySelectorAll('br')]) {
    if (!br.parentNode) continue;
    let next = br.nextSibling;
    while (next && (isBreak(next) || isBlank(next))) {
      const after = next.nextSibling;
      if (isBreak(next)) next.remove();
      next = after;
    }
  }
}

function stripInvisible(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const next = node.data.replace(INVISIBLE_RE, '');
    if (next !== node.data) node.data = next;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
