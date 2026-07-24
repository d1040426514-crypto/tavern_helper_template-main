import type { WorldbookEntry } from '@types/function/worldbook';
import { loadSettings } from '../settings';
import { resolveEffectiveSettings } from '../tasks/effective-settings';
import type { ChatWorldbookWriteRule } from '../tasks/schema';
import { resolveWriteTargetBookName, upsertEntryByStableName } from './write-from-template';
import {
  isManagedWorldbookEntryName,
  ledgerEntryKey,
  ledgerStableNamesForBook,
  mergeAppliedLedgerEntries,
  shouldDeleteManagedEntryAsOrphan,
} from './write-ledger-utils';
import {
  POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY,
  WORKFLOW_HELPER_ENTRY_PREFIX,
  getSelectedWorldInfoBookName,
  reloadSelectedWorldInfoEditor,
  reloadWorldInfoEditorIfSelected,
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
export {
  customEntryNamePrefix,
  isManagedWorldbookEntryName,
  isManagedWorldbookEntryNameForRule,
  ledgerEntryKey,
  ledgerStableNamesForBook,
  mergeAppliedLedgerEntries,
  shouldDeleteManagedEntryAsOrphan,
} from './write-ledger-utils';

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

/**
 * 删除全部世界书中的工作流助手托管条目（WorkflowHelper-）。
 * 不碰聊天写入账本/快照，也不触发 reconcile 重放。
 */
export async function purgeAllManagedWorldbookEntries(): Promise<number> {
  return withWorldbookWriteLock(async () => {
    const rules = resolveEffectiveSettings(loadSettings()).chatWorldbookWriteRules ?? [];
    let bookNames: string[];
    try {
      bookNames = getWorldbookNames();
    } catch {
      bookNames = collectTargetBookNames(rules);
    }
    if (!bookNames.length) return 0;

    const selectedBook = getSelectedWorldInfoBookName();
    const emptyKeep = new Set<string>();
    let deleted = 0;
    const affectedBooks: string[] = [];
    for (const bookName of bookNames) {
      const isSelected = !!selectedBook && bookName === selectedBook;
      try {
        const result = await deleteWorldbookEntries(
          bookName,
          entry => shouldDeleteManagedEntryAsOrphan(entry.name || '', rules, emptyKeep),
          isSelected ? { render: 'immediate' } : undefined,
        );
        const n = result?.deleted_entries?.length ?? 0;
        deleted += n;
        if (n > 0) affectedBooks.push(bookName);
      } catch (e) {
        console.warn('[工作流助手] 清理托管世界书条目失败:', bookName, e);
      }
    }

    if (selectedBook && affectedBooks.includes(selectedBook)) {
      reloadSelectedWorldInfoEditor(selectedBook);
    }
    return deleted;
  });
}

let lastInitReconcileLedgerSize = 0;
let initReconcileSucceeded = false;
/** 空账本软保护重试次数（避免聊天未就绪时误清托管条目） */
let emptyLedgerRetryCount = 0;

/** init / 切聊天阶段允许「账本暂时为空」：不删托管条目，稍后重试 */
function shouldGuardEmptyLedger(reason: string): boolean {
  return (
    reason.startsWith('init') ||
    reason === 'chat_changed' ||
    reason === 'ledger_retry' ||
    reason === 'mvu_extra_analysis_deferred'
  );
}

function scheduleEmptyLedgerRetry(_reason: string): void {
  if (emptyLedgerRetryCount >= 4) return;
  emptyLedgerRetryCount += 1;
  scheduleWorldbookReconcile('ledger_retry', 1200);
}

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

      if (isInit && !isChatLedgerReadable()) {
        scheduleEmptyLedgerRetry(reason);
        return;
      }

      // 切聊天/初始化时账本可能尚未可读：禁止按空账本清光托管条目
      if (ledger.size === 0 && shouldGuardEmptyLedger(reason)) {
        scheduleEmptyLedgerRetry(reason);
        return;
      }

      await deleteOrphanManagedWorldbookEntries(bookNames, rules, ledger);

      if (!ledger.size) {
        if (isInit) {
          initReconcileSucceeded = true;
          lastInitReconcileLedgerSize = 0;
        }
        return;
      }

      const writtenBooks = new Set<string>();
      for (const entry of ledger.values()) {
        const partial = _.cloneDeep(entry.partial);
        partial.name = entry.stableName;
        try {
          await upsertEntryByStableName(entry.bookName, entry.stableName, partial);
          writtenBooks.add(entry.bookName);
        } catch (e) {
          console.warn('[工作流助手] 重放世界书条目失败:', entry.stableName, e);
        }
      }
      reloadWorldInfoEditorIfSelected(writtenBooks);
      emptyLedgerRetryCount = 0;
      if (isInit || reason === 'chat_changed' || reason === 'ledger_retry') {
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
  emptyLedgerRetryCount = 0;

  const runInit = (pass: number) => {
    if (pass === 2 && initReconcileSucceeded && lastInitReconcileLedgerSize > 0) return;
    void reconcileWorldbookWritesFromChat({ reason: `init-${pass}` });
  };
  setTimeout(() => runInit(1), 1200);
  setTimeout(() => runInit(2), 3500);

  const offDeleted = eventOn(tavern_events.MESSAGE_DELETED, () => {
    scheduleWorldbookReconcile('message_deleted', 500);
  });

  const offChatChanged = eventOn(tavern_events.CHAT_CHANGED, (chatId: string) => {
    const id = String(chatId ?? '').trim();
    if (!id) return;
    initReconcileSucceeded = false;
    lastInitReconcileLedgerSize = 0;
    emptyLedgerRetryCount = 0;
    scheduleWorldbookReconcile('chat_changed', 800);
  });

  return {
    stop: () => {
      if (reconcileTimer) {
        clearTimeout(reconcileTimer);
        reconcileTimer = null;
      }
      pendingReconcile = null;
      offDeleted.stop();
      offChatChanged.stop();
    },
  };
}
