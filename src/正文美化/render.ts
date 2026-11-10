import { absolutizeAvatarUrl, loadAvatarIndex, type AvatarIndex } from './avatar';
import {
  classifyParagraph,
  extractGametxt,
  firstGrapheme,
  normalizeKey,
  parseDialogue,
  planBeautify,
  type BeautifyPlan,
} from './parse';

const SKIP =
  '.TH-render, iframe, pre, code, script, style, textarea, .char-info-runtime-host, [data-char-info], [data-char-info-runtime-owned], .custom-au5-wrap, .item-card-letter, .gametxt-dialogue, .mes_reasoning, .mes_reasoning_details, .mes_reasoning_summary';

const INLINE_TAGS = new Set(['SPAN', 'EM', 'STRONG', 'B', 'I', 'Q', 'BR']);
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u00AD\u180E]/g;

const tokens = new Map<number, number>();

export async function renderAllMessages(): Promise<void> {
  let last = -1;
  try {
    last = getLastMessageId();
  } catch {
    return;
  }
  await Promise.all(Array.from({ length: last + 1 }, (_item, id) => renderMessage(id)));
}

export async function renderMessage(messageId: number): Promise<void> {
  if (!Number.isInteger(messageId) || messageId < 0) return;
  const token = (tokens.get(messageId) ?? 0) + 1;
  tokens.set(messageId, token);
  try {
    const raw = getChatMessages(messageId)[0]?.message ?? '';
    const inner = extractGametxt(raw);
    if (inner == null) return;
    const plan = planBeautify(inner);
    if (!plan.paragraphs.length) return;
    const avatars = await loadAvatarIndex();
    if (tokens.get(messageId) !== token) return;
    const root = messageRoot(messageId) ?? (await waitForRoot(messageId, token));
    if (!root || tokens.get(messageId) !== token) return;
    applyPlan(root, plan, avatars);
  } catch (error) {
    console.error('[正文美化] 渲染楼层失败', messageId, error);
  }
}

function messageRoot(messageId: number): HTMLElement | null {
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

function applyPlan(root: HTMLElement, plan: BeautifyPlan, avatars: AvatarIndex): void {
  const paragraphs = [...root.querySelectorAll('p')];
  for (const paragraph of paragraphs) {
    if (paragraph.closest(SKIP)) continue;
    if (paragraph.dataset.gametxtBeauty === 'prose') {
      stripInvisible(paragraph);
      continue;
    }
    const kind = classifyParagraph(paragraph.textContent ?? '', plan);
    if (kind === 'dialogue') decorateDialogue(paragraph, avatars);
    else if (kind === 'prose') decorateProse(paragraph);
  }
}

function decorateProse(paragraph: HTMLParagraphElement): void {
  stripInvisible(paragraph);
  paragraph.classList.add('gametxt-prose');
  paragraph.dataset.gametxtBeauty = 'prose';
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
  const prefix = new RegExp(`^\\s*\\{${escapeRegExp(name)}\\}\\s*[「“]`);
  if (textNodes[0]) textNodes[0].data = textNodes[0].data.replace(prefix, '');
  const last = textNodes[textNodes.length - 1];
  if (last) last.data = last.data.replace(/[」”]\s*$/, '');
  sanitizeInline(clone);
  const left = normalizeKey(clone.textContent ?? '');
  if (!left || left.includes(`{${name}}`)) return escapeHtml(line);
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

function stripInvisible(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) node.data = node.data.replace(INVISIBLE_RE, '');
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
