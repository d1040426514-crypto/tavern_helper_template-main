export function textOf(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

export function isNonEmptyText(v: unknown): boolean {
  return textOf(v).trim().length > 0;
}

export function entriesOf(map: unknown): [string, any][] {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
  return Object.entries(map as Record<string, any>);
}

export function hasAnyText(obj: unknown, keys: string[]): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return keys.some(k => isNonEmptyText(o[k]));
}

export function parseProgressPct(raw: unknown): number {
  const s = textOf(raw).trim();
  if (!s) return 0;
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*%?/);
  if (!m) return 0;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export type ChangeTone = 'up' | 'down' | 'flat' | 'unknown';

export function parseChangeTone(raw: unknown): ChangeTone {
  const s = textOf(raw).trim();
  if (!s) return 'unknown';
  if (/[+\u2191\u2197]|涨|升|上/.test(s) && !/跌|降|下|-\d/.test(s.replace(/^\s*[-−]/, ''))) return 'up';
  if (/[-−\u2193\u2198]|跌|降|下/.test(s)) return 'down';
  if (/平|持平|0%|\+0/.test(s)) return 'flat';
  if (/^\s*\+/.test(s)) return 'up';
  if (/^\s*-/.test(s)) return 'down';
  return 'unknown';
}

export function kvPairs(obj: unknown, labels?: string[]): { key: string; value: string }[] {
  if (!obj || typeof obj !== 'object') return [];
  const o = obj as Record<string, unknown>;
  const keys = labels ?? Object.keys(o);
  return keys
    .filter(k => isNonEmptyText(o[k]) && typeof o[k] !== 'object')
    .map(k => ({ key: k, value: textOf(o[k]) }));
}
