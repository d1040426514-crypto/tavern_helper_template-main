import { resolveStableEntryName, resolveWriteTargetBookName } from '../worldbook/write-from-template';
import { resolveWrapperStableNames } from '../worldbook/write-ledger-utils';
import {
  POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY,
  reloadWorldInfoEditorIfSelected,
  upsertAppliedInList,
  type WorldbookWriteAppliedEntry,
} from '../worldbook/write-sync';
import { findLatestAssistantFloorId } from './message-floor';
import type { ChatWorldbookWriteRule } from './schema';
import { parseExtractTagSpec } from './tag-extract';

export type RemovedReplicaInfo = {
  rootId: string;
  spec: string;
  attrValues: string[];
};

export type PrunableWorldbookTarget = {
  bookName: string;
  stableName: string;
};

/** 依据被删副本的 attrValue，推导应清理的世界书条目（bookName + stableName） */
export function computePrunableWorldbookTargets(
  removed: RemovedReplicaInfo[],
  rules: ChatWorldbookWriteRule[],
): PrunableWorldbookTarget[] {
  const targets: PrunableWorldbookTarget[] = [];
  const seen = new Set<string>();

  for (const info of removed) {
    if (!info.attrValues.length) continue;
    const rootSpec = parseExtractTagSpec(info.spec || '');

    for (const rule of rules) {
      if (!rule.splitByAttr) continue;
      const ruleSpec = parseExtractTagSpec(rule.targetTag.trim());
      if (!ruleSpec?.attrName) continue;
      if (rootSpec) {
        if (ruleSpec.tagName !== rootSpec.tagName) continue;
        if (rootSpec.attrName && ruleSpec.attrName !== rootSpec.attrName) continue;
      }
      const bookName = resolveWriteTargetBookName(rule);
      if (!bookName) continue;

      for (const attrValue of info.attrValues) {
        const stableName = resolveStableEntryName(rule, attrValue);
        const key = `${bookName}\0${stableName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ bookName, stableName });
      }
    }
  }

  return targets;
}

/** 删除世界书里实际条目（按 bookName 分组批量删） */
export async function deleteWorldbookEntriesByStableName(
  targets: PrunableWorldbookTarget[],
): Promise<void> {
  const byBook = new Map<string, Set<string>>();
  for (const { bookName, stableName } of targets) {
    if (!byBook.has(bookName)) byBook.set(bookName, new Set());
    byBook.get(bookName)!.add(stableName.trim());
  }
  for (const [bookName, names] of byBook) {
    try {
      await deleteWorldbookEntries(bookName, entry => names.has((entry.name || '').trim()));
    } catch (e) {
      console.warn('[工作流助手] 删除副本世界书条目失败:', bookName, e);
    }
  }
  reloadWorldInfoEditorIfSelected(byBook.keys());
}

/** 从全部 assistant 楼的 applied 账本中移除命中的 stableName 记录 */
export async function pruneAppliedLedgerFromChat(stableNames: Set<string>): Promise<void> {
  if (!stableNames.size) return;
  const lastId = getLastMessageId();
  if (lastId < 0) return;

  let msgs;
  try {
    msgs = getChatMessages(`0-${lastId}`);
  } catch {
    return;
  }

  for (const msg of msgs) {
    if (msg.role !== 'assistant') continue;
    const data = (msg.data ?? {}) as Record<string, unknown>;
    const raw = data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
    if (!Array.isArray(raw) || !raw.length) continue;

    const list = raw as WorldbookWriteAppliedEntry[];
    const filtered = list.filter(entry => !stableNames.has((entry?.stableName ?? '').trim()));
    if (filtered.length === list.length) continue;

    const nextData = { ...data };
    if (filtered.length) {
      nextData[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY] = filtered;
    } else {
      delete nextData[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
    }
    try {
      await setChatMessages([{ message_id: msg.message_id, data: nextData }], { refresh: 'none' });
    } catch (e) {
      console.warn('[工作流助手] 清理 applied 账本失败:', msg.message_id, e);
    }
  }
}

function canonicalRuleSpec(rule: ChatWorldbookWriteRule): string {
  const spec = parseExtractTagSpec(rule.targetTag.trim());
  if (!spec?.attrName) return '';
  return `${spec.tagName}@${spec.attrName}`.trim().toLowerCase();
}

function appendClearedWrapperTargets(
  targets: PrunableWorldbookTarget[],
  rules: ChatWorldbookWriteRule[],
  clearedSpecs: string[],
): void {
  if (!clearedSpecs.length) return;
  const cleared = new Set(clearedSpecs.map(spec => spec.trim().toLowerCase()).filter(Boolean));
  const seen = new Set(targets.map(target => `${target.bookName}\0${target.stableName}`));
  for (const rule of rules) {
    if (!rule.splitByAttr) continue;
    const spec = canonicalRuleSpec(rule);
    if (!spec || !cleared.has(spec)) continue;
    const bookName = resolveWriteTargetBookName(rule);
    if (!bookName) continue;
    const wrappers = resolveWrapperStableNames(rule);
    for (const stableName of [wrappers.before, wrappers.after]) {
      const key = `${bookName}\0${stableName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ bookName, stableName });
    }
  }
}

/** 墓碑先落在最新 assistant 楼，再删书。删除失败也保留墓碑，避免旧楼账本把条目写回来。 */
export async function writeLatestFloorLedgerTombstones(
  targets: PrunableWorldbookTarget[],
): Promise<void> {
  if (!targets.length) return;
  const floorId = findLatestAssistantFloorId();
  if (floorId == null) return;
  const msg = getChatMessages(floorId)[0];
  if (!msg) return;
  const data = { ...(msg.data ?? {}) } as Record<string, unknown>;
  const raw = data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
  let list = Array.isArray(raw) ? [...(raw as WorldbookWriteAppliedEntry[])] : [];
  for (const target of targets) {
    const tombstone: WorldbookWriteAppliedEntry = {
      ruleId: '',
      bookName: target.bookName,
      stableName: target.stableName,
      removed: true,
      partial: {},
    };
    list = upsertAppliedInList(list, tombstone).list;
  }
  await setChatMessages(
    [
      {
        message_id: floorId,
        data: { ...data, [POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY]: list },
      },
    ],
    { refresh: 'none' },
  );
}

/** 被删副本 → 最新一楼墓碑 + 删除对应世界书条目。不改更早楼的账本。 */
export async function pruneWorldbookForRemovedReplicas(
  removed: RemovedReplicaInfo[],
  rules: ChatWorldbookWriteRule[],
  options?: { clearedSpecs?: string[] },
): Promise<void> {
  if (!removed.length || !rules.length) return;
  const targets = computePrunableWorldbookTargets(removed, rules);
  appendClearedWrapperTargets(targets, rules, options?.clearedSpecs ?? []);
  if (!targets.length) return;

  await writeLatestFloorLedgerTombstones(targets);
  await deleteWorldbookEntriesByStableName(targets);
}
