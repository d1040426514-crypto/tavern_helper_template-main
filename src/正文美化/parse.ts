const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u00AD\u180E]/g;

const PROTECTED_SOURCE =
  '<char_info\\b[^>]*>[\\s\\S]*?<\\/char_info\\s*>|<item_info\\b[^>]*>[\\s\\S]*?<\\/item_info\\s*>|<inner_voice\\b[^>]*>[\\s\\S]*?<\\/inner_voice\\s*>|<action_info\\b[^>]*>[\\s\\S]*?<\\/action_info\\s*>|<aurelia\\b[^>]*>[\\s\\S]*?<\\/(?:aurelia|a)\\s*>|<venture\\b[^>]*>[\\s\\S]*?<\\/venture\\s*>|<tp\\b[^>]*>[\\s\\S]*?<\\/tp\\s*>|<style\\b[^>]*>[\\s\\S]*?<\\/style\\s*>|```[\\s\\S]*?```';

const DIALOGUE_RE = /^\{([^{}\n]{1,40})\}\s*(?:「([\s\S]*)」|“([\s\S]*)”)$/;

export type BeautifyParagraph = {
  kind: 'dialogue' | 'prose';
  key: string;
  name?: string;
  line?: string;
};

export type BeautifyPlan = {
  paragraphs: BeautifyParagraph[];
  protectedText: string;
};

/** 取 `</think>` 之后的第一段 `<gametxt>`，与角色管理库使用同一段正文。 */
export function extractGametxt(raw: string): string | null {
  let after = 0;
  for (const match of raw.matchAll(/<\/think\s*>/gi)) {
    after = match.index + match[0].length;
  }
  const slice = raw.slice(after);
  const open = /<gametxt\b[^>]*>/i.exec(slice);
  if (!open) return null;
  const start = open.index + open[0].length;
  const close = /<\/gametxt\s*>/i.exec(slice.slice(start));
  if (!close) return null;
  return slice.slice(start, start + close.index);
}

export function normalizeKey(input: string): string {
  const text = decodeEntities(stripJy(input))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(INVISIBLE_RE, '');
  return text.replace(/\s+/g, ' ').trim();
}

export function parseDialogue(key: string): { name: string; line: string } | null {
  const match = DIALOGUE_RE.exec(key);
  if (!match) return null;
  const name = match[1].trim();
  if (!name) return null;
  return { name, line: (match[2] ?? match[3] ?? '').trim() };
}

export function firstGrapheme(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '？';
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    for (const part of segmenter.segment(trimmed)) return part.segment;
  }
  return Array.from(trimmed)[0] ?? '？';
}

export function planBeautify(inner: string): BeautifyPlan {
  const protectedParts = inner.match(protectedPattern()) ?? [];
  const textOnly = inner.replace(protectedPattern(), '\n\n');
  const paragraphs: BeautifyParagraph[] = [];
  for (const part of textOnly.split(/\n\s*\n/)) {
    const key = normalizeKey(part);
    if (!key) continue;
    const dialogue = parseDialogue(key);
    if (dialogue) {
      paragraphs.push({ kind: 'dialogue', key, name: dialogue.name, line: dialogue.line });
    } else {
      paragraphs.push({ kind: 'prose', key });
    }
  }
  return {
    paragraphs,
    protectedText: protectedParts.map(part => normalizeKey(part)).filter(Boolean).join('\n'),
  };
}

export function classifyParagraph(plain: string, plan: BeautifyPlan): 'dialogue' | 'prose' | null {
  const key = normalizeKey(plain);
  if (!key) return null;
  const known = plan.paragraphs.find(paragraph => paragraph.key === key);
  if (!known) return null;
  if (known.kind === 'dialogue' && plan.protectedText.includes(key)) return null;
  return known.kind;
}

function protectedPattern(): RegExp {
  return new RegExp(PROTECTED_SOURCE, 'gi');
}

function stripJy(input: string): string {
  let text = input.replace(/<!--[\s\S]*?-->/g, '');
  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replace(/<jy-source\b[^>]*>[\s\S]*?<\/jy-source>/gi, '');
  }
  return text.replace(/<\/?jy-translation\b[^>]*>/gi, '').replace(/<\/?say\b[^>]*>/gi, '');
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}
