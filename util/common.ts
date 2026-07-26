import { compare } from 'compare-versions';
import JSON5 from 'json5';
import { jsonrepair } from 'jsonrepair';
import { toDotPath } from 'zod/v4/core';

export function assignInplace<T>(destination: T[], new_array: T[]): T[] {
  destination.length = 0;
  destination.push(...new_array);
  return destination;
}

// 修正 _.merge 对数组的合并逻辑, [1, 2, 3] 和 [4, 5] 合并后变成 [4, 5] 而不是 [4, 5, 3]
export function correctlyMerge<TObject, TSource>(lhs: TObject, rhs: TSource): TObject & TSource {
  return _.mergeWith(lhs, rhs, (_lhs, rhs) => (_.isArray(rhs) ? rhs : undefined));
}

export function chunkBy<T>(array: T[], predicate: (lhs: T, rhs: T) => boolean): T[][] {
  if (array.length === 0) {
    return [];
  }

  const chunks: T[][] = [[array[0]]];
  for (const [lhs, rhs] of _.zip(_.dropRight(array), _.drop(array))) {
    if (predicate(lhs!, rhs!)) {
      chunks[chunks.length - 1].push(rhs!);
    } else {
      chunks.push([rhs!]);
    }
  }
  return chunks;
}

export function regexFromString(input: string, replace_macros?: boolean): RegExp | null {
  if (!input) {
    return null;
  }
  const makeRegex = (pattern: string, flags: string) => {
    if (replace_macros) {
      pattern = substitudeMacros(pattern);
    }
    return new RegExp(pattern, flags);
  };
  try {
    const match = input.match(/\/(.+)\/([a-z]*)/i);
    if (!match) {
      return makeRegex(_.escapeRegExp(input), 'i');
    }
    if (match[2] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(match[3])) {
      return makeRegex(input, 'i');
    }
    let flags = match[2] ?? '';
    _.pull(flags, 'g');
    if (flags.indexOf('i') === -1) {
      flags = flags + 'i';
    }
    return makeRegex(match[1], flags);
  } catch {
    return null;
  }
}

export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function checkMinimumVersion(expected: string, title: string) {
  if (compare(await getTavernHelperVersion(), expected, '<')) {
    toastr.error(`'${title}' 需要酒馆助手版本 >= '${expected}'`, '版本不兼容');
  }
}

export function prettifyErrorWithInput(error: z.ZodError) {
  return _([...error.issues])
    .sortBy(issue => issue.path?.length ?? 0)
    .flatMap(issue => {
      const lines = [`✖ ${issue.message}`];
      if (issue.path?.length) {
        lines.push(`  → 路径: ${toDotPath(issue.path)}`);
      }
      if (issue.input !== undefined) {
        lines.push(`  → 输入: ${JSON.stringify(issue.input)}`);
      }
      return lines;
    })
    .join('\n');
}

export function literalYamlify(value: any) {
  return YAML.stringify(value, { blockQuote: 'literal' });
}

/** 从 start（必须是 `[` 或 `{`）提取括号平衡的子串 */
export function extractBalancedJsonSlice(text: string, start: number): string {
  const open = text[start];
  const close = open === '[' ? ']' : open === '{' ? '}' : '';
  if (!close) throw new Error('extractBalancedJsonSlice: start 必须指向 [ 或 {');
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('JSON 括号不匹配。');
}

/**
 * 将残缺的 JSON Patch 数组文本按单条 op 尽力解析。
 * 括号不配或单条非法时跳到下一条 `"op"`；可选对单条再用 jsonrepair。
 */
export function parseJsonPatchArrayLenient(
  patchArrayText: string,
  options?: { repairOp?: boolean },
): { ops: unknown[]; skipped: number; repaired: number } {
  const text = String(patchArrayText || '').trim();
  if (!text.startsWith('[')) return { ops: [], skipped: 0, repaired: 0 };
  const ops: unknown[] = [];
  let skipped = 0;
  let repaired = 0;
  let i = 1;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i]!)) i++;
    if (i >= text.length || text[i] === ']') break;
    if (text[i] !== '{') {
      const next = text.slice(i).search(/\{\s*"op"\s*:/);
      if (next < 0) break;
      i += next;
      continue;
    }
    try {
      const slice = extractBalancedJsonSlice(text, i);
      let parsed: unknown | undefined;
      try {
        parsed = JSON.parse(slice);
      } catch {
        if (options?.repairOp) {
          try {
            parsed = JSON.parse(jsonrepair(slice));
            repaired++;
          } catch {
            skipped++;
          }
        } else {
          skipped++;
        }
      }
      if (parsed !== undefined) ops.push(parsed);
      i += slice.length;
    } catch {
      skipped++;
      const next = text.slice(i + 1).search(/\{\s*"op"\s*:/);
      if (next < 0) break;
      i = i + 1 + next;
    }
  }
  return { ops, skipped, repaired };
}

export function parseString(content: string): any {
  const json_first = /^[[{]/s.test(content.trimStart());
  try {
    if (json_first) {
      throw Error(`expected error`);
    }
    return YAML.parseDocument(content, { merge: true }).toJS();
  } catch (yaml_error1) {
    try {
      // eslint-disable-next-line import-x/no-named-as-default-member
      return JSON5.parse(content);
    } catch (json5_error) {
      try {
        return JSON.parse(jsonrepair(content));
      } catch (json_error) {
        try {
          if (!json_first) {
            throw Error(`expected error`);
          }
          return YAML.parseDocument(content, { merge: true }).toJS();
        } catch (yaml_error2) {
          const toError = (error: unknown) =>
            error instanceof Error ? `${error.stack ? error.stack : error.message}` : String(error);

          throw new Error(
            literalYamlify({
              ['要解析的字符串不是有效的 YAML/JSON/JSON5 格式']: {
                字符串内容: content,
                YAML错误信息: toError(json_first ? yaml_error2 : yaml_error1),
                JSON5错误信息: toError(json5_error),
                JSON错误信息: toError(json_error),
              },
            }),
          );
        }
      }
    }
  }
}
