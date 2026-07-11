import type { WorldbookEntry } from '@types/function/worldbook';
import { loadSettings } from '../settings';
import { resolveEffectiveSettings } from '../tasks/effective-settings';
import type { ChatWorldbookWriteRule } from '../tasks/schema';
import { resolveWriteTargetBookName, upsertEntryByStableName } from './write-from-template';
import {
  POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY,
  WORKFLOW_HELPER_ENTRY_PREFIX,
  withWorldbookWriteLock,
  type WorldbookWriteAppliedEntry,
} from './write-sync';

export type { WorldbookWriteAppliedEntry } from './write-sync';
export {
  appendAppliedToMessage,
  clearWorldbookWriteMessageKeys,
  POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY,
  withWorldbookWriteLock,
  WORKFLOW_HELPER_ENTRY_PREFIX,
} from './write-sync';

export type ReconcileWorldbookWritesOptions = {
  excludeMessageId?: number;
  maxMessageId?: number;
  reason?: string;
};

let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileInFlight = false;
let pendingReconcile: { delayMs: number; reason: string } | null = null;

function isMvuExtraAnalysisActive(): boolean {
  try {
    return typeof Mvu !== 'undefined' && Mvu.isDuringExtraAnalysis?.() === true;
  } catch {
    return false;
  }
}

export function ledgerEntryKey(bookName: string, stableName: string): string {
  return `${bookName.trim()}\0${stableName.trim()}`;
}

export function customEntryNamePrefix(rule: ChatWorldbookWriteRule): string | null {
  const custom = rule.entryName.trim();
  if (!custom) return null;
  if (custom.includes('{attrValue}')) {
    return custom.split('{attrValue}')[0] ?? null;
  }
  return custom;
}

export function isManagedWorldbookEntryName(name: string, rules: ChatWorldbookWriteRule[]): boolean {
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(WORKFLOW_HELPER_ENTRY_PREFIX)) return true;
  return rules.some(rule => {
    const prefix = customEntryNamePrefix(rule);
    return !!prefix && trimmed.startsWith(prefix);
  });
}

export function mergeAppliedLedgerEntries(
  batches: WorldbookWriteAppliedEntry[][],
): Map<string, WorldbookWriteAppliedEntry> {
  const merged = new Map<string, WorldbookWriteAppliedEntry>();
  for (const batch of batches) {
    for (const entry of batch) {
      if (!entry?.bookName?.trim() || !entry?.stableName?.trim()) continue;
      merged.set(ledgerEntryKey(entry.bookName, entry.stableName), entry);
    }
  }
  return merged;
}

export function collectTargetBookNames(rules: ChatWorldbookWriteRule[]): string[] {
  const names = new Set<string>();
  for (const rule of rules) {
    const bookName = resolveWriteTargetBookName(rule);
    if (bookName) names.add(bookName);
  }
  return [...names];
}

function readAppliedFromMessage(messageId: number): WorldbookWriteAppliedEntry[] {
  const msg = getChatMessages(messageId)[0];
  if (!msg || msg.role !== 'assistant') return [];
  const data = (msg.data ?? {}) as Record<string, unknown>;
  const raw = data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is WorldbookWriteAppliedEntry =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as WorldbookWriteAppliedEntry).bookName === 'string' &&
      typeof (item as WorldbookWriteAppliedEntry).stableName === 'string' &&
      !!(item as WorldbookWriteAppliedEntry).partial,
  );
}

export function collectAppliedLedgerFromChat(options: ReconcileWorldbookWritesOptions = {}): Map<
  string,
  WorldbookWriteAppliedEntry
> {
  const lastId = getLastMessageId();
  if (lastId < 0) return new Map();

  const maxId =
    options.maxMessageId != null && options.maxMessageId >= 0
      ? Math.min(options.maxMessageId, lastId)
      : lastId;

  let msgs;
  try {
    msgs = getChatMessages(`0-${maxId}`);
  } catch {
    return new Map();
  }

  const batches: WorldbookWriteAppliedEntry[][] = [];
  for (const msg of msgs) {
    if (msg.role !== 'assistant') continue;
    if (options.excludeMessageId != null && msg.message_id === options.excludeMessageId) continue;
    batches.push(readAppliedFromMessage(msg.message_id));
  }
  return mergeAppliedLedgerEntries(batches);
}

/** 聊天楼层是否可读（避免 init 时 chat 未加载就 reconcile） */
export function isChatLedgerReadable(): boolean {
  const lastId = getLastMessageId();
  if (lastId < 0) return false;
  try {
    getChatMessages(`0-${lastId}`);
    return true;
  } catch {
    return false;
  }
}

export function ledgerStableNamesForBook(
  ledger: Map<string, WorldbookWriteAppliedEntry>,
  bookName: string,
): Set<string> {
  const names = new Set<string>();
  const trimmedBook = bookName.trim();
  for (const entry of ledger.values()) {
    if (entry.bookName.trim() !== trimmedBook) continue;
    names.add(entry.stableName.trim());
  }
  return names;
}

/** 托管条目是否应删除：在 ledger 中无对应 stableName 的孤儿 */
export function shouldDeleteManagedEntryAsOrphan(
  entryName: string,
  rules: ChatWorldbookWriteRule[],
  ledgerStableNames: Set<string>,
): boolean {
  const trimmed = (entryName || '').trim();
  if (!trimmed) return false;
  if (!isManagedWorldbookEntryName(trimmed, rules)) return false;
  return !ledgerStableNames.has(trimmed);
}

/** 仅删除 ledger 中不存在的托管条目（保留 uid/顺序） */
export async function deleteOrphanManagedWorldbookEntries(
  bookNames: string[],
  rules: ChatWorldbookWriteRule[],
  ledger: Map<string, WorldbookWriteAppliedEntry>,
): Promise<number> {
  let deleted = 0;
  for (const bookName of bookNames) {
    const keepNames = ledgerStableNamesForBook(ledger, bookName);
    try {
      const result = await deleteWorldbookEntries(bookName, entry =>
        shouldDeleteManagedEntryAsOrphan(entry.name || '', rules, keepNames),
      );
      deleted += result?.deleted_entries?.length ?? 0;
    } catch (e) {
      console.warn('[工作流助手] 清理孤儿世界书条目失败:', bookName, e);
    }
  }
  return deleted;
}

/** @deprecated 请使用 deleteOrphanManagedWorldbookEntries */
export async function deleteManagedWorldbookEntries(
  bookNames: string[],
  rules: ChatWorldbookWriteRule[],
): Promise<number> {
  return deleteOrphanManagedWorldbookEntries(bookNames, rules, new Map());
}

let lastInitReconcileLedgerSize = 0;
let initReconcileSucceeded = false;

export async function reconcileWorldbookWritesFromChat(
  options: ReconcileWorldbookWritesOptions = {},
): Promise<void> {
  if (isMvuExtraAnalysisActive()) {
    scheduleWorldbookReconcile('mvu_extra_analysis_deferred', 500);
    return;
  }

  await withWorldbookWriteLock(async () => {
    if (reconcileInFlight) return;
    reconcileInFlight = true;
    try {
      const settings = resolveEffectiveSettings(loadSettings());
      const rules = settings.chatWorldbookWriteRules ?? [];
      const bookNames = collectTargetBookNames(rules);
      if (!bookNames.length) return;

      const ledger = collectAppliedLedgerFromChat(options);
      const reason = options.reason ?? 'unknown';
      const isInit = reason.startsWith('init');

      if (isInit && !isChatLedgerReadable()) return;

      if (isInit && ledger.size === 0) return;

      await deleteOrphanManagedWorldbookEntries(bookNames, rules, ledger);

      if (!ledger.size) {
        if (isInit) {
          initReconcileSucceeded = true;
          lastInitReconcileLedgerSize = 0;
        }
        return;
      }

      for (const entry of ledger.values()) {
        const partial = _.cloneDeep(entry.partial);
        partial.name = entry.stableName;
        try {
          await upsertEntryByStableName(entry.bookName, entry.stableName, partial);
        } catch (e) {
          console.warn('[工作流助手] 重放世界书条目失败:', entry.stableName, e);
        }
      }
      if (isInit) {
        initReconcileSucceeded = true;
        lastInitReconcileLedgerSize = ledger.size;
      }
    } finally {
      reconcileInFlight = false;
    }
  });
}

export function scheduleWorldbookReconcile(reason: string, delayMs = 500): void {
  pendingReconcile = { delayMs, reason };
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    const pending = pendingReconcile;
    pendingReconcile = null;
    if (!pending) return;
    void reconcileWorldbookWritesFromChat({ reason: pending.reason });
  }, delayMs);
}

export function registerWorldbookWriteReconcile(): EventOnReturn {
  initReconcileSucceeded = false;
  lastInitReconcileLedgerSize = 0;

  const runInit = (pass: number) => {
    if (pass === 2 && initReconcileSucceeded && lastInitReconcileLedgerSize > 0) return;
    void reconcileWorldbookWritesFromChat({ reason: `init-${pass}` });
  };
  setTimeout(() => runInit(1), 1200);
  setTimeout(() => runInit(2), 3500);

  const offDeleted = eventOn(tavern_events.MESSAGE_DELETED, () => {
    scheduleWorldbookReconcile('message_deleted', 500);
  });

  return {
    stop: () => {
      if (reconcileTimer) {
        clearTimeout(reconcileTimer);
        reconcileTimer = null;
      }
      pendingReconcile = null;
      offDeleted.stop();
    },
  };
}
