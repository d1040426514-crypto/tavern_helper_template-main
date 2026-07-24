/** JSON Pointer 写路径自愈：自动补全缺失的中间 object 节点 */

function isObjectContainer(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getAtPath(root: unknown, segments: string[]): unknown {
  let current = root;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      if (segment === '-') {
        return undefined;
      }
      current = current[Number(segment)];
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

export function pathExists(root: unknown, segments: string[]): boolean {
  return getAtPath(root, segments) !== undefined;
}

/**
 * 写操作前补全路径：世界必须已存在；中间缺失的 map 键补 `{}`；
 * 标量中间节点不可自愈。
 */
export function ensurePathForWrite(root: Record<string, unknown>, segments: string[]): void {
  if (segments.length === 0) {
    throw new Error('不能对根路径执行该操作');
  }

  const worldKey = segments[0]!;
  if (!(worldKey in root)) {
    throw new Error(`路径不存在: /${segments.join('/')}`);
  }

  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (!isObjectContainer(current)) {
      throw new Error(`路径不存在: /${segments.join('/')}`);
    }
    const obj = current;

    if (i > 0 && obj[seg] === undefined) {
      obj[seg] = {};
    } else if (obj[seg] !== undefined && i < segments.length - 2 && !isObjectContainer(obj[seg])) {
      throw new Error(`路径不存在: /${segments.join('/')}`);
    }

    current = obj[seg];
    if (current === undefined) {
      throw new Error(`路径不存在: /${segments.join('/')}`);
    }
  }

  if (!isObjectContainer(current) && !Array.isArray(current)) {
    throw new Error(`路径不存在: /${segments.join('/')}`);
  }
}

export function resolveParentStrict(
  root: Record<string, unknown>,
  segments: string[],
): { parent: Record<string, unknown> | unknown[]; key: string } {
  if (segments.length === 0) {
    throw new Error('不能对根路径执行该操作');
  }
  const parentSegments = segments.slice(0, -1);
  const key = segments[segments.length - 1]!;
  let parent: unknown = root;
  for (const segment of parentSegments) {
    if (parent === null || parent === undefined) {
      throw new Error(`路径不存在: /${segments.join('/')}`);
    }
    if (Array.isArray(parent)) {
      if (segment === '-') {
        throw new Error(`路径不存在: /${segments.join('/')}`);
      }
      parent = parent[Number(segment)];
      continue;
    }
    if (typeof parent === 'object') {
      parent = (parent as Record<string, unknown>)[segment];
      continue;
    }
    throw new Error(`路径不存在: /${segments.join('/')}`);
  }
  if (parent === null || parent === undefined || typeof parent !== 'object') {
    throw new Error(`路径不存在: /${segments.join('/')}`);
  }
  return { parent: parent as Record<string, unknown> | unknown[], key };
}

export function resolveParentForWrite(
  root: Record<string, unknown>,
  segments: string[],
): { parent: Record<string, unknown> | unknown[]; key: string } {
  ensurePathForWrite(root, segments);
  return resolveParentStrict(root, segments);
}
