const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
};

const MS_PER_MIN = UNIT_MS.minute;

/** 将年月日时分编码为可比较的毫秒值（用于虚构历法 / 游戏内日历，非 Unix 时间戳） */
function encodeCalendarMs(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const y = Math.max(0, Math.floor(year));
  const mo = Math.min(12, Math.max(1, Math.floor(month)));
  const d = Math.min(31, Math.max(1, Math.floor(day)));
  const h = Math.min(23, Math.max(0, Math.floor(hour)));
  const mi = Math.min(59, Math.max(0, Math.floor(minute)));
  const dayIndex = y * 372 + (mo - 1) * 31 + (d - 1);
  return ((dayIndex * 24 + h) * 60 + mi) * MS_PER_MIN;
}

/** 清洗变量/标签中的时间文本：取首行、去掉 @ 后地点、折叠空白 */
export function normalizeGameTimeRaw(raw: string): string {
  let text = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!text) return '';
  text = text.split('\n')[0].trim();
  const at = text.indexOf('@');
  if (at >= 0) text = text.slice(0, at).trim();
  const pipe = text.indexOf('|');
  if (pipe >= 0) text = text.slice(0, pipe).trim();
  return text.replace(/\s+/g, ' ').trim();
}

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 将常见中文数字（约 0–9999）转为整数；无法识别时返回 null */
export function chineseNumeralToInt(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);

  let total = 0;
  let section = 0;
  let num = 0;
  let hasDigit = false;

  for (const ch of s) {
    if (ch in CN_DIGIT) {
      num = CN_DIGIT[ch];
      hasDigit = true;
      continue;
    }
    if (ch === '十') {
      section += (num || 1) * 10;
      num = 0;
      hasDigit = true;
      continue;
    }
    if (ch === '百') {
      section += (num || 1) * 100;
      num = 0;
      hasDigit = true;
      continue;
    }
    if (ch === '千') {
      section += (num || 1) * 1000;
      num = 0;
      hasDigit = true;
      continue;
    }
    if (ch === '万') {
      total += (section + num) * 10_000;
      section = 0;
      num = 0;
      hasDigit = true;
      continue;
    }
    return null;
  }

  if (!hasDigit) return null;
  return total + section + num;
}

const YEAR_TOKEN_RE = /(?:(\d+)|([一二三四五六七八九十百千万两零〇]+))\s*年/;

function parseYearFromText(text: string): number | null {
  const m = text.match(YEAR_TOKEN_RE);
  if (!m) return null;
  if (m[1] != null) return Number(m[1]);
  return chineseNumeralToInt(m[2]);
}

function extractClock(text: string): { hour: number; minute: number } | null {
  const colon = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})(?:\s*[:：]\s*(\d{2}))?/);
  if (colon) return { hour: Number(colon[1]), minute: Number(colon[2]) };
  const cn = text.match(/(\d{1,2})\s*时\s*(\d{1,2})\s*分?/);
  if (cn) return { hour: Number(cn[1]), minute: Number(cn[2]) };
  return null;
}

function tryParseExplicitYmd(text: string, parseFormat?: string): number | null {
  if (!parseFormat) return null;
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
}

function tryParseIso(text: string): number | null {
  if (/年|星期|纪元|第\s*\d+\s*天/.test(text)) return null;
  if (!/^\d{4}[-/.T\s]/.test(text)) return null;
  const iso = Date.parse(text);
  if (!Number.isNaN(iso)) return iso;
  return null;
}

/** 2026-06-30 15:48 / 2026/06/30 15:48 */
function tryParseNumericDate(text: string): number | null {
  const m = text.match(
    /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:\s+(\d{1,2})\s*[:：]\s*(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  if (h != null) {
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      s != null ? Number(s) : 0,
    ).getTime();
  }
  return encodeCalendarMs(Number(y), Number(mo), Number(d));
}

/**
 * 中文/架空历法：
 * - 复兴纪元488年-5月-14日-星期三-15:48、2026年6月30日15时30分
 * - 新王国历十年-01/01/10:15、新王国历十年-01/01 10:15
 * - 复兴纪元488年-5-14-15:48
 */
function tryParseChineseCalendar(text: string): number | null {
  const year = parseYearFromText(text);
  if (year == null || Number.isNaN(year)) return null;

  // 年 + 斜杠/点/横杠月日（可无「月」「日」字），时刻可选：十年-01/01/10:15、488年-5-14-15:48
  const slashM = text.match(
    /(?:(?:\d+)|(?:[一二三四五六七八九十百千万两零〇]+))\s*年\s*[-/]?\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.\-\s]\s*(\d{1,2})\s*[:：]\s*(\d{2}))?/,
  );
  if (slashM) {
    const month = Number(slashM[1]);
    const day = Number(slashM[2]);
    if (slashM[3] != null && slashM[4] != null) {
      return encodeCalendarMs(year, month, day, Number(slashM[3]), Number(slashM[4]));
    }
    const clock = extractClock(text);
    if (clock) return encodeCalendarMs(year, month, day, clock.hour, clock.minute);
    return encodeCalendarMs(year, month, day);
  }

  const monthM = text.match(/(\d{1,2})\s*月/);
  const dayM = text.match(/(\d{1,2})\s*日/);
  if (!monthM || !dayM) return null;

  const month = Number(monthM[1]);
  const day = Number(dayM[1]);
  const clock = extractClock(text);
  if (clock) return encodeCalendarMs(year, month, day, clock.hour, clock.minute);
  return encodeCalendarMs(year, month, day);
}

/** 简写：488-5-14 15:48（无「年月日」汉字） */
function tryParseDashDate(text: string): number | null {
  const m = text.match(/^(\d{3,})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})(?:\s+(\d{1,2})\s*[:：]\s*(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  if (h != null && mi != null) {
    return encodeCalendarMs(Number(y), Number(mo), Number(d), Number(h), Number(mi));
  }
  return encodeCalendarMs(Number(y), Number(mo), Number(d));
}

function tryParseDayCount(text: string): number | null {
  const cn = text.match(/第?\s*(\d+)\s*天(?:\s*(\d{1,2})\s*[:：时]\s*(\d{1,2}))?/);
  if (!cn) return null;
  const day = Number(cn[1]);
  const hour = cn[2] != null ? Number(cn[2]) : 0;
  const minute = cn[3] != null ? Number(cn[3]) : 0;
  return day * UNIT_MS.day + hour * UNIT_MS.hour + minute * UNIT_MS.minute;
}

/** 仅当整段文本就是 HH:mm / H时mm分 时使用，避免在长文本中误匹配 */
function tryParseTimeOnly(text: string): number | null {
  const hm = text.match(/^(\d{1,2})\s*[:：]\s*(\d{2})$/);
  if (hm) return Number(hm[1]) * UNIT_MS.hour + Number(hm[2]) * UNIT_MS.minute;
  const hmCn = text.match(/^(\d{1,2})\s*时\s*(\d{1,2})\s*分?$/);
  if (hmCn) return Number(hmCn[1]) * UNIT_MS.hour + Number(hmCn[2]) * UNIT_MS.minute;
  return null;
}

export function parseGameTimeToMs(raw: string, parseFormat?: string): number | null {
  const text = normalizeGameTimeRaw(raw);
  if (!text) return null;

  const parsers = [
    () => tryParseExplicitYmd(text, parseFormat),
    () => tryParseIso(text),
    () => tryParseNumericDate(text),
    () => tryParseChineseCalendar(text),
    () => tryParseDashDate(text),
    () => tryParseDayCount(text),
    () => tryParseTimeOnly(text),
  ];

  for (const parse of parsers) {
    const ms = parse();
    if (ms != null && !Number.isNaN(ms)) return ms;
  }

  return null;
}

export function intervalToMs(value: number, unit: keyof typeof UNIT_MS): number {
  return value * (UNIT_MS[unit] ?? UNIT_MS.hour);
}

const REMAINING_PARTS: { unit: keyof typeof UNIT_MS; label: string }[] = [
  { unit: 'year', label: '年' },
  { unit: 'month', label: '月' },
  { unit: 'week', label: '周' },
  { unit: 'day', label: '天' },
  { unit: 'hour', label: '小时' },
  { unit: 'minute', label: '分钟' },
];

/** 将剩余毫秒格式化为简短中文时长（最多两个单位） */
export function formatRemainingDuration(remainingMs: number): string {
  let left = Math.max(0, Math.floor(remainingMs));
  if (left < UNIT_MS.minute) return '不足1分钟';

  const parts: string[] = [];
  for (const { unit, label } of REMAINING_PARTS) {
    const size = UNIT_MS[unit];
    if (left < size) continue;
    const n = Math.floor(left / size);
    parts.push(`${n}${label}`);
    left -= n * size;
    if (parts.length >= 2) break;
  }
  return parts.length ? parts.join('') : '不足1分钟';
}

export const GAME_TIME_FORMAT_HELP = {
  preprocess:
    '解析前仅取首行；@ 之后视为地点、| 之后视为天气/备注并自动剥离。例：复兴纪元488年-5月-14日-15:48 @ 某地| 天气 → 只解析日期时间部分。',
  examples: [
    '中文/架空历法：复兴纪元488年5月14日15:48、2026年6月30日15时30分',
    '中文年份 + 斜杠月日：新王国历十年-01/01/10:15、新王国历十年-01/01 10:15',
    '横杠月日时：复兴纪元488年-5-14-15:48',
    '横杠简写：488-5-14 15:48',
    '公历数字：2026-06-30 15:48、2026/06/30 15:48',
    'ISO 类：以四位年份开头的 2026-06-30T15:48 等',
    '天数计数：第12天、第 3 天 8:30',
    '仅时刻（整段无日期）：15:48、15时30分',
  ],
  footnote:
    '含「年/月/日」的架空历法按游戏内日历比较间隔，不是 Unix 真实时间戳；无法识别时跳过本任务，原因见运行日志。',
} as const;
