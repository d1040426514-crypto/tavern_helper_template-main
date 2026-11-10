const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u00AD\u180E]/g;

const INLINE_TAGS = new Set(['span', 'em', 'strong', 'b', 'i', 'q', 'br', 'a']);
const RAW_TEXT_TAGS = new Set(['style', 'script', 'textarea', 'pre', 'code']);
/** 半角 {} 与全角 ｛｝ 都认，但要求成对，不认半全角混用。 */
const DIALOGUE_RE =
  /^(?:\{([^{}\n]{1,40})\}|｛([^｛｝\n]{1,40})｝)\s*(?:「([\s\S]*)」|“([\s\S]*)”)$/;

export type BeautifyParagraph = {
  kind: 'dialogue' | 'prose';
  key: string;
  name?: string;
  line?: string;
};

export type InnerVoice = {
  role: string;
  key: string;
};

export type BeautifyPlan = {
  paragraphs: BeautifyParagraph[];
  protectedText: string;
  innerVoices: InnerVoice[];
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
  const text = decodeEntities(stripInlineWrappers(input))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(INVISIBLE_RE, '');
  return text.replace(/\s+/g, ' ').trim();
}

export function parseDialogue(key: string): { name: string; line: string } | null {
  const match = DIALOGUE_RE.exec(key);
  if (!match) return null;
  const name = (match[1] ?? match[2] ?? '').trim();
  if (!name) return null;
  return { name, line: (match[3] ?? match[4] ?? '').trim() };
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

/**
 * 剔除自定义标签块 / 围栏 / 注释，只留下可美化的叙述与对白文本。
 * 行内标签保留；jy-source 丢弃，jy-translation 保留内部。
 */
export function stripProtectedBlocks(inner: string): { text: string; protectedText: string } {
  const protectedParts: string[] = [];
  let out = '';
  let i = 0;

  while (i < inner.length) {
    if (inner.startsWith('```', i)) {
      const end = inner.indexOf('```', i + 3);
      const stop = end < 0 ? inner.length : end + 3;
      protectedParts.push(inner.slice(i, stop));
      out += '\n\n';
      i = stop;
      continue;
    }

    if (inner.startsWith('<!--', i)) {
      const end = inner.indexOf('-->', i + 4);
      const stop = end < 0 ? inner.length : end + 3;
      protectedParts.push(inner.slice(i, stop));
      out += '\n\n';
      i = stop;
      continue;
    }

    if (inner[i] === '<') {
      const tag = readTag(inner, i);
      if (!tag) {
        out += inner[i];
        i += 1;
        continue;
      }

      if (tag.kind === 'close') {
        // 孤立闭标签：丢掉尖括号，避免污染 key
        i = tag.end;
        continue;
      }

      const name = tag.name.toLowerCase();
      if (INLINE_TAGS.has(name)) {
        if (tag.selfClosing || tag.kind === 'open') {
          out += inner.slice(i, tag.end);
          i = tag.end;
          continue;
        }
      }

      if (name === 'jy-source') {
        const close = findClose(inner, tag.end, name);
        const stop = close ? close.end : blankBoundary(inner, tag.end);
        protectedParts.push(inner.slice(i, stop));
        out += '\n\n';
        i = stop;
        continue;
      }

      if (name === 'jy-translation') {
        const close = findClose(inner, tag.end, name);
        if (close) {
          // 镜译常嵌套同名标签，保留最内层译文，去掉残留的 jy 标签壳
          const kept = inner
            .slice(tag.end, close.start)
            .replace(/<\/?jy-translation\b[^>]*>/gi, '');
          out += kept;
          i = close.end;
        } else {
          const stop = blankBoundary(inner, tag.end);
          out += inner.slice(tag.end, stop).replace(/<\/?jy-translation\b[^>]*>/gi, '');
          i = stop;
        }
        continue;
      }

      if (tag.selfClosing) {
        protectedParts.push(inner.slice(i, tag.end));
        out += '\n\n';
        i = tag.end;
        continue;
      }

      if (RAW_TEXT_TAGS.has(name) || !INLINE_TAGS.has(name)) {
        const close = findClose(inner, tag.end, name);
        const stop = close ? close.end : blankBoundary(inner, tag.end);
        protectedParts.push(inner.slice(i, stop));
        out += '\n\n';
        i = stop;
        continue;
      }
    }

    out += inner[i];
    i += 1;
  }

  return {
    text: out,
    protectedText: protectedParts.map(part => normalizeKey(part)).filter(Boolean).join('\n'),
  };
}

export function planBeautify(inner: string): BeautifyPlan {
  const stripped = stripProtectedBlocks(inner);
  const paragraphs: BeautifyParagraph[] = [];
  for (const part of stripped.text.split(/\n\s*\n/)) {
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
    protectedText: stripped.protectedText,
    innerVoices: extractInnerVoices(inner),
  };
}

/**
 * 内心话在显示层会丢掉 `<inner_voice>` 外壳（role 也一起丢），
 * 只能从原文取 role，再用译文文本去对页面段落。
 */
export function extractInnerVoices(inner: string): InnerVoice[] {
  const voices: InnerVoice[] = [];
  const openRe = /<inner_voice\b/gi;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(inner))) {
    const tag = readTag(inner, match.index);
    if (!tag || tag.kind !== 'open' || tag.selfClosing) continue;
    const head = inner.slice(match.index, tag.end);
    const role = /\brole\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(head);
    const close = findClose(inner, tag.end, 'inner_voice');
    if (!close) continue;
    const body = inner.slice(tag.end, close.start);
    const translated = body
      .replace(/<jy-source\b[^>]*>[\s\S]*?<\/jy-source\s*>/gi, '')
      .replace(/<\/?jy-(?:source|translation)\b[^>]*>/gi, '');
    const key = voiceKey(translated) || voiceKey(body.replace(/<\/?jy-[\w-]+\b[^>]*>/gi, ''));
    const name = (role?.[1] ?? role?.[2] ?? '').trim();
    if (key && name) voices.push({ role: name, key });
    openRe.lastIndex = close.end;
  }
  return voices;
}

export function matchInnerVoice(plain: string, plan: BeautifyPlan): InnerVoice | null {
  if (!plan.innerVoices.length) return null;
  if (parseDialogue(normalizeKey(plain))) return null;
  const key = voiceKey(plain);
  if (!key) return null;
  const exact = plan.innerVoices.find(voice => voice.key === key);
  if (exact) return exact;
  if (key.length < 6) return null;
  return (
    plan.innerVoices.find(
      voice => voice.key.includes(key) || (key.includes(voice.key) && key.length - voice.key.length <= 4),
    ) ?? null
  );
}

/** 比较用：去空白、去外层括号（镜译重排会剥掉译文外的（）），只留正文字符。 */
function voiceKey(input: string): string {
  return normalizeKey(input.replace(/<!--[\s\S]*?-->/g, ''))
    .replace(/\s+/g, '')
    .replace(/^[（(「“"]+|[）)」”"]+$/g, '');
}

export function classifyParagraph(plain: string, plan: BeautifyPlan): 'dialogue' | 'prose' | null {
  const key = normalizeKey(plain);
  if (!key) return null;
  const known = plan.paragraphs.find(paragraph => paragraph.key === key);
  if (!known) return null;
  if (known.kind === 'dialogue' && plan.protectedText.includes(key)) return null;
  return known.kind;
}

type TagInfo = {
  kind: 'open' | 'close';
  name: string;
  selfClosing: boolean;
  end: number;
};

function readTag(input: string, start: number): TagInfo | null {
  if (input[start] !== '<') return null;
  if (input.startsWith('<!--', start)) return null;

  const close = input[start + 1] === '/';
  let i = start + (close ? 2 : 1);
  if (i >= input.length || !/[A-Za-z_\u4e00-\u9fff]/.test(input[i])) return null;

  const nameStart = i;
  i += 1;
  while (i < input.length && /[\w:.\-\u4e00-\u9fff]/u.test(input[i])) i += 1;
  const name = input.slice(nameStart, i);
  if (!name) return null;

  if (close) {
    while (i < input.length && /\s/.test(input[i])) i += 1;
    if (input[i] !== '>') return null;
    return { kind: 'close', name, selfClosing: false, end: i + 1 };
  }

  // 跳过属性，注意引号
  while (i < input.length) {
    const ch = input[i];
    if (ch === '>') break;
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < input.length && input[i] !== quote) i += 1;
      if (i < input.length) i += 1;
      continue;
    }
    i += 1;
  }
  if (input[i] !== '>') return null;
  const selfClosing = input[i - 1] === '/';
  return { kind: 'open', name, selfClosing, end: i + 1 };
}

function findClose(
  input: string,
  from: number,
  name: string,
): { start: number; end: number } | null {
  const lower = name.toLowerCase();
  let depth = 1;
  let i = from;
  while (i < input.length) {
    if (input.startsWith('```', i)) {
      const end = input.indexOf('```', i + 3);
      i = end < 0 ? input.length : end + 3;
      continue;
    }
    if (input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4);
      i = end < 0 ? input.length : end + 3;
      continue;
    }
    if (input[i] !== '<') {
      i += 1;
      continue;
    }
    const tag = readTag(input, i);
    if (!tag) {
      i += 1;
      continue;
    }
    if (tag.name.toLowerCase() === lower) {
      if (tag.kind === 'open' && !tag.selfClosing) depth += 1;
      else if (tag.kind === 'close') {
        depth -= 1;
        if (depth === 0) return { start: i, end: tag.end };
      }
    }
    i = tag.end;
  }
  return null;
}

/** 未找到同名闭标签时，保护到下一个空行，避免吞掉后续对白。 */
function blankBoundary(input: string, from: number): number {
  const match = /\n\s*\n/.exec(input.slice(from));
  return match ? from + match.index : input.length;
}

function stripInlineWrappers(input: string): string {
  return input.replace(/<\/?say\b[^>]*>/gi, '');
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
