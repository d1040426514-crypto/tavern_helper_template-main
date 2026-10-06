const FLAG_CHARS = new Set(['g', 'i', 'm', 's', 'u', 'y']);

/** 类外的未转义 `/` 才是结束符。字符类不嵌套；`[` 或 `[^` 后的 `]` 是类内字面量。 */
function findRegexLiteralClose(literal: string): number {
  let escaped = false;
  let inClass = false;
  let classPhase = 2;
  for (let i = 1; i < literal.length; i++) {
    const ch = literal[i]!;
    if (escaped) {
      escaped = false;
      if (inClass && classPhase < 2) classPhase = 2;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inClass) {
      if (ch === '[') {
        inClass = true;
        classPhase = 0;
        continue;
      }
      if (ch === '/') return i;
      continue;
    }
    if (ch === ']' && classPhase === 2) {
      inClass = false;
      continue;
    }
    if (ch === ']' && classPhase < 2) {
      classPhase = 2;
      continue;
    }
    if (ch === '^' && classPhase === 0) {
      classPhase = 1;
      continue;
    }
    classPhase = 2;
  }
  return -1;
}

export type RegexMatchSpan = { startIdx: number; endIdx: number };

/**
 * 解析 `/表达式/标志`。没写斜杠时整段当作表达式。
 * 标志只认 imsuy；收集匹配时一律带 g。非法则返回 null。
 */
export function compileUserRegex(raw: string): RegExp | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  let source = trimmed;
  let flags = '';
  if (trimmed.startsWith('/')) {
    const close = findRegexLiteralClose(trimmed);
    if (close < 0) return null;
    source = trimmed.slice(1, close);
    flags = trimmed.slice(close + 1).trim();
  }

  if (!source) return null;

  let flagStr = '';
  const seen = new Set<string>();
  for (const ch of flags) {
    if (!FLAG_CHARS.has(ch) || seen.has(ch)) return null;
    seen.add(ch);
    if (ch !== 'g') flagStr += ch;
  }
  flagStr += 'g';

  try {
    return new RegExp(source, flagStr);
  } catch {
    return null;
  }
}

export function isUserRegexInvalid(pattern: string): boolean {
  const trimmed = String(pattern ?? '').trim();
  if (!trimmed) return false;
  return compileUserRegex(trimmed) == null;
}

/** 整段匹配的起止位置。零长度命中略过，避免空匹配卡住。 */
export function collectRegexMatchSpans(text: string, pattern: string): RegexMatchSpan[] {
  const re = compileUserRegex(pattern);
  if (!re) return [];
  const source = String(text ?? '');
  const spans: RegexMatchSpan[] = [];
  for (const match of source.matchAll(re)) {
    const startIdx = match.index;
    if (startIdx == null) continue;
    const len = match[0].length;
    if (len <= 0) continue;
    spans.push({ startIdx, endIdx: startIdx + len });
  }
  return spans;
}

/** 第一处整段匹配原文，不用捕获组。 */
export function firstRegexFullMatch(text: string, pattern: string): string | null {
  const span = collectRegexMatchSpans(text, pattern)[0];
  if (!span) return null;
  return String(text ?? '').slice(span.startIdx, span.endIdx);
}
