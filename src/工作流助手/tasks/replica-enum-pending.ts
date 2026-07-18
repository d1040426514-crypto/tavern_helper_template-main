/** 本轮阶段同步收到的 ReplicaEnum 属性值（按原本 id），供写楼层快照合并 */

let pendingLastEnumByRootId: Record<string, string[]> = {};

export function recordPendingLastEnumAttrValues(rootId: string, values: string[]): void {
  const cleaned = values.map(v => String(v ?? '').trim()).filter(Boolean);
  if (!rootId || !cleaned.length) return;
  pendingLastEnumByRootId[rootId] = [...cleaned];
}

export function takePendingLastEnumAttrValues(): Record<string, string[]> {
  const out = pendingLastEnumByRootId;
  pendingLastEnumByRootId = {};
  return out;
}

/** 测试用：清空 pending */
export function clearPendingLastEnumAttrValues(): void {
  pendingLastEnumByRootId = {};
}
