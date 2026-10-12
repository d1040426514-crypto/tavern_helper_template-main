import type { ReplicaStateSnapshot } from './replica-state';

/** 只记哪些楼的快照里有哪些根，不保存成员名单，也不搬到新楼。 */
const rootsByFloor = new Map<number, string[]>();

export function rememberReplicaSnapshotFloor(
  messageId: number,
  snapshot: ReplicaStateSnapshot | null | undefined,
): void {
  if (messageId < 0) return;
  const roots = snapshot ? Object.keys(snapshot).filter(id => !!snapshot[id]) : [];
  if (!roots.length) {
    rootsByFloor.delete(messageId);
    return;
  }
  rootsByFloor.set(messageId, roots);
}

export function takeReplicaSnapshotFloorRoots(messageId: number): string[] {
  const roots = rootsByFloor.get(messageId) ?? [];
  rootsByFloor.delete(messageId);
  return [...roots];
}

export function replaceReplicaSnapshotFloorIndex(entries: Iterable<[number, string[]]>): void {
  rootsByFloor.clear();
  for (const [messageId, roots] of entries) {
    if (messageId < 0 || !roots.length) continue;
    rootsByFloor.set(messageId, [...roots]);
  }
}
