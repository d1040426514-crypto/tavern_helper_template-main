import {
  POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY,
  POST_PROCESS_WORLDBOOK_WRITE_SNAPSHOT_KEY,
  resolveStableEntryName,
  resolveWriteTargetBookName,
  upsertEntryByStableName,
  type WorldbookWriteSnapshotEntry,
} from '../worldbook/write-from-template';
import {
  type WorldbookWriteAppliedEntry,
} from '../worldbook/write-sync';
import { normalizeKeywordList } from '../worldbook/entry-keys';
import type { ChatWorldbookWriteRule } from './schema';
import { parseExtractTagSpec } from './tag-extract';
import { deleteWorldbookEntriesByStableName } from './prune-applied-for-replica';

export type ReplicaAttrRenameTarget = {
  bookName: string;
  oldStableName: string;
  newStableName: string;
  rule: ChatWorldbookWriteRule;
  fromAttr: string;
  toAttr: string;
};

function specsMatch(
  rootSpec: ReturnType<typeof parseExtractTagSpec>,
  ruleSpec: ReturnType<typeof parseExtractTagSpec>,
): boolean {
  if (!rootSpec || !ruleSpec?.attrName) return false;
  if (ruleSpec.tagName !== rootSpec.tagName) return false;
  if (rootSpec.attrName && ruleSpec.attrName !== rootSpec.attrName) return false;
  return true;
}

/** 按 replica enum spec + from/to 推导世界书迁移目标（splitByAttr 规则） */
export function computeReplicaAttrRenameTargets(
  spec: string,
  fromAttr: string,
  toAttr: string,
  rules: ChatWorldbookWriteRule[],
): ReplicaAttrRenameTarget[] {
  const from = String(fromAttr ?? '').trim();
  const to = String(toAttr ?? '').trim();
  if (!from || !to || from === to || !rules.length) return [];
  const rootSpec = parseExtractTagSpec(spec || '');
  if (!rootSpec?.attrName) return [];

  const targets: ReplicaAttrRenameTarget[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    if (!rule.splitByAttr) continue;
    const ruleSpec = parseExtractTagSpec(rule.targetTag.trim());
    if (!specsMatch(rootSpec, ruleSpec)) continue;
    const bookName = resolveWriteTargetBookName(rule);
    if (!bookName) continue;
    const oldStableName = resolveStableEntryName(rule, from);
    const newStableName = resolveStableEntryName(rule, to);
    if (!oldStableName || !newStableName || oldStableName === newStableName) continue;
    const key = `${bookName}\0${oldStableName}\0${newStableName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ bookName, oldStableName, newStableName, rule, fromAttr: from, toAttr: to });
  }
  return targets;
}

function remapExactKeyword(list: string[] | undefined, from: string, to: string): string[] | undefined {
  if (!list) return list;
  return normalizeKeywordList(list).map(k => (k === from ? to : k));
}

/** 纯函数：将 applied 条目的 stableName / keys / extraKeys 从旧身份迁到新身份；不匹配则返回 null */
export function rewriteAppliedEntryForAttrRename(
  entry: WorldbookWriteAppliedEntry,
  oldStableName: string,
  newStableName: string,
  fromAttr: string,
  toAttr: string,
): WorldbookWriteAppliedEntry | null {
  if ((entry.stableName ?? '').trim() !== oldStableName.trim()) return null;
  const partial = { ...(entry.partial ?? {}) } as WorldbookWriteAppliedEntry['partial'];
  partial.name = newStableName;
  if (partial.strategy && typeof partial.strategy === 'object') {
    const strategy = { ...partial.strategy };
    if (Array.isArray(strategy.keys)) {
      strategy.keys = remapExactKeyword(strategy.keys, fromAttr, toAttr) ?? [];
    }
    partial.strategy = strategy;
  }
  const extraKeys = Array.isArray(entry.extraKeys)
    ? remapExactKeyword(entry.extraKeys, fromAttr, toAttr)
    : undefined;
  return {
    ...entry,
    stableName: newStableName,
    partial,
    ...(extraKeys ? { extraKeys } : {}),
  };
}

/** 纯函数：改写一整楼 applied 列表；若 newStable 已存在则跳过该条（不覆盖） */
export function rewriteAppliedListForAttrRename(
  list: WorldbookWriteAppliedEntry[],
  oldStableName: string,
  newStableName: string,
  fromAttr: string,
  toAttr: string,
): { next: WorldbookWriteAppliedEntry[]; changed: number } {
  const hasNew = list.some(e => (e.stableName ?? '').trim() === newStableName.trim());
  let changed = 0;
  const next: WorldbookWriteAppliedEntry[] = [];
  for (const entry of list) {
    if ((entry.stableName ?? '').trim() !== oldStableName.trim()) {
      next.push(entry);
      continue;
    }
    if (hasNew) {
      next.push(entry);
      continue;
    }
    const rewritten = rewriteAppliedEntryForAttrRename(
      entry,
      oldStableName,
      newStableName,
      fromAttr,
      toAttr,
    );
    if (rewritten) {
      next.push(rewritten);
      changed += 1;
    } else {
      next.push(entry);
    }
  }
  return { next, changed };
}

/** 纯函数：改写 snapshot 列表中的 entryName */
export function rewriteSnapshotListForAttrRename(
  snapshots: WorldbookWriteSnapshotEntry[],
  oldStableName: string,
  newStableName: string,
): { next: WorldbookWriteSnapshotEntry[]; changed: number } {
  const hasNew = snapshots.some(s => (s.entryName ?? '').trim() === newStableName.trim());
  let changed = 0;
  const next = snapshots.map(snap => {
    if ((snap.entryName ?? '').trim() !== oldStableName.trim()) return snap;
    if (hasNew) return snap;
    changed += 1;
    return { ...snap, entryName: newStableName };
  });
  return { next, changed };
}

async function worldbookEntryExists(bookName: string, stableName: string): Promise<boolean> {
  try {
    const entries = await getWorldbook(bookName);
    return entries.some(e => (e.name || '').trim() === stableName.trim());
  } catch {
    return false;
  }
}

/** preflight：任一 splitByAttr 目标的 newStableName 已存在于世界书则不可迁移 */
export async function canMigrateWorldbookForReplicaAttrRename(
  spec: string,
  fromAttr: string,
  toAttr: string,
  rules: ChatWorldbookWriteRule[],
): Promise<boolean> {
  const targets = computeReplicaAttrRenameTargets(spec, fromAttr, toAttr, rules);
  if (!targets.length) return true;
  for (const target of targets) {
    if (await worldbookEntryExists(target.bookName, target.newStableName)) {
      return false;
    }
  }
  return true;
}

async function rewriteMessageWorldbookDataForAttrRename(
  oldStableName: string,
  newStableName: string,
  fromAttr: string,
  toAttr: string,
): Promise<number> {
  const lastId = getLastMessageId();
  if (lastId < 0) return 0;

  let msgs;
  try {
    msgs = getChatMessages(`0-${lastId}`);
  } catch {
    return 0;
  }

  let totalChanged = 0;
  const updates: Array<{ message_id: number; data: Record<string, unknown> }> = [];

  for (const msg of msgs) {
    if (msg.role !== 'assistant') continue;
    const data = { ...(msg.data ?? {}) } as Record<string, unknown>;
    let messageChanged = false;

    const rawApplied = data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
    if (Array.isArray(rawApplied) && rawApplied.length) {
      const { next, changed } = rewriteAppliedListForAttrRename(
        rawApplied as WorldbookWriteAppliedEntry[],
        oldStableName,
        newStableName,
        fromAttr,
        toAttr,
      );
      if (changed > 0) {
        data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY] = next;
        totalChanged += changed;
        messageChanged = true;
      }
    }

    const rawSnapshots = data[POST_PROCESS_WORLDBOOK_WRITE_SNAPSHOT_KEY];
    if (Array.isArray(rawSnapshots) && rawSnapshots.length) {
      const { next, changed } = rewriteSnapshotListForAttrRename(
        rawSnapshots as WorldbookWriteSnapshotEntry[],
        oldStableName,
        newStableName,
      );
      if (changed > 0) {
        data[POST_PROCESS_WORLDBOOK_WRITE_SNAPSHOT_KEY] = next;
        messageChanged = true;
      }
    }

    if (messageChanged) {
      updates.push({ message_id: msg.message_id, data });
    }
  }

  if (updates.length) {
    try {
      await setChatMessages(updates, { refresh: 'none' });
    } catch (e) {
      console.warn('[工作流助手] 迁移 applied/snapshot 账本失败:', e);
    }
  }
  return totalChanged;
}

async function rewriteAppliedLedgerAttrRenameInChat(
  oldStableName: string,
  newStableName: string,
  fromAttr: string,
  toAttr: string,
): Promise<number> {
  return rewriteMessageWorldbookDataForAttrRename(oldStableName, newStableName, fromAttr, toAttr);
}

async function readWorldbookEntryPartial(
  bookName: string,
  stableName: string,
): Promise<Partial<WorldbookEntry> | null> {
  try {
    const entries = await getWorldbook(bookName);
    const found = entries.find(e => (e.name || '').trim() === stableName.trim());
    if (!found) return null;
    const { uid: _uid, ...rest } = found;
    return { ...rest, name: stableName };
  } catch {
    return null;
  }
}

export type MigrateWorldbookForReplicaResult = {
  migrated: number;
  /** 存在旧条目但 upsert/delete 失败的目标 stableName */
  failedTargets: string[];
  /** 存在旧世界书条目、本应迁移的目标数 */
  expectedEntryMigrations: number;
};

/**
 * 迁移世界书条目 + 全聊天 applied 账本：oldStable → newStable。
 * 目标条目已存在时跳过该目标（不覆盖）。
 */
export async function migrateWorldbookForReplicaAttrRename(
  spec: string,
  fromAttr: string,
  toAttr: string,
  rules: ChatWorldbookWriteRule[],
): Promise<MigrateWorldbookForReplicaResult> {
  const targets = computeReplicaAttrRenameTargets(spec, fromAttr, toAttr, rules);
  if (!targets.length) {
    return { migrated: 0, failedTargets: [], expectedEntryMigrations: 0 };
  }

  let migrated = 0;
  let expectedEntryMigrations = 0;
  const failedTargets: string[] = [];
  for (const target of targets) {
    const { bookName, oldStableName, newStableName, fromAttr: from, toAttr: to } = target;

    if (await worldbookEntryExists(bookName, newStableName)) {
      console.warn(
        `[工作流助手] 世界书改名跳过：${bookName} 已存在「${newStableName}」`,
      );
      continue;
    }

    const oldPartial = await readWorldbookEntryPartial(bookName, oldStableName);
    if (oldPartial) {
      expectedEntryMigrations += 1;
      const remappedKeys = remapExactKeyword(
        (oldPartial.strategy as { keys?: string[] } | undefined)?.keys,
        from,
        to,
      );
      const partial: Partial<WorldbookEntry> = {
        ...oldPartial,
        name: newStableName,
      };
      if (partial.strategy && typeof partial.strategy === 'object' && remappedKeys) {
        partial.strategy = { ...partial.strategy, keys: remappedKeys };
      }
      try {
        await upsertEntryByStableName(bookName, newStableName, partial);
        await deleteWorldbookEntriesByStableName([{ bookName, stableName: oldStableName }]);
        migrated += 1;
      } catch (e) {
        console.warn('[工作流助手] 迁移世界书条目失败:', bookName, oldStableName, '→', newStableName, e);
        failedTargets.push(newStableName);
        continue;
      }
    }

    await rewriteAppliedLedgerAttrRenameInChat(oldStableName, newStableName, from, to);
  }
  return { migrated, failedTargets, expectedEntryMigrations };
}
