import type { WorldbookEntry } from '@types/function/worldbook';
import { POST_PROCESS_WORLDBOOK_WRITE_SNAPSHOT_KEY } from './write-from-template';

export const POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY = '_post_process_worldbook_write_applied';
export const WORKFLOW_HELPER_ENTRY_PREFIX = 'WorkflowHelper-';

export type WorldbookWriteAppliedEntry = {
  ruleId: string;
  bookName: string;
  stableName: string;
  partial: Partial<WorldbookEntry>;
};

export function appliedLedgerKey(bookName: string, stableName: string): string {
  return `${bookName.trim()}\0${stableName.trim()}`;
}

/** 同楼 applied 账本：同 bookName+stableName 覆盖（多阶段写入时保留最后一次） */
export function upsertAppliedInList(
  list: WorldbookWriteAppliedEntry[],
  applied: WorldbookWriteAppliedEntry,
): { list: WorldbookWriteAppliedEntry[]; replaced: boolean } {
  const key = appliedLedgerKey(applied.bookName, applied.stableName);
  const idx = list.findIndex(e => appliedLedgerKey(e.bookName, e.stableName) === key);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = applied;
    return { list: next, replaced: true };
  }
  return { list: [...list, applied], replaced: false };
}

let writeLock: Promise<void> = Promise.resolve();

export async function withWorldbookWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn);
  writeLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 酒馆世界书编辑器当前选中的书名（用于仅刷新当前打开的编辑器） */
export function getSelectedWorldInfoBookName(): string | null {
  try {
    const sel = (parent as unknown as { document?: Document })?.document?.querySelector?.(
      '#world_info',
    ) as HTMLSelectElement | null;
    const label = sel?.selectedOptions?.[0]?.textContent?.trim();
    return label || null;
  } catch {
    return null;
  }
}

/**
 * 仅刷新当前已打开的世界书编辑器（loadIfNotSelected=false，避免把其它书载入界面）。
 * @returns 是否成功调用
 */
export function reloadSelectedWorldInfoEditor(bookName: string): boolean {
  const trimmed = bookName.trim();
  if (!trimmed) return false;
  try {
    const st =
      (globalThis as { SillyTavern?: { reloadWorldInfoEditor?: (file: string, loadIfNotSelected?: boolean) => void } })
        .SillyTavern ??
      (parent as unknown as { SillyTavern?: { reloadWorldInfoEditor?: (file: string, loadIfNotSelected?: boolean) => void } })
        ?.SillyTavern;
    if (typeof st?.reloadWorldInfoEditor !== 'function') return false;
    st.reloadWorldInfoEditor(trimmed, false);
    return true;
  } catch {
    return false;
  }
}

/** 若当前编辑器正打开 `writtenBooks` 中的某本，则刷新该编辑器 */
export function reloadWorldInfoEditorIfSelected(writtenBooks: Iterable<string>): {
  selectedBook: string | null;
  reloaded: boolean;
} {
  const selectedBook = getSelectedWorldInfoBookName();
  if (!selectedBook) return { selectedBook: null, reloaded: false };
  const set = writtenBooks instanceof Set ? writtenBooks : new Set([...writtenBooks].map(b => b.trim()));
  if (!set.has(selectedBook)) return { selectedBook, reloaded: false };
  return { selectedBook, reloaded: reloadSelectedWorldInfoEditor(selectedBook) };
}

export async function appendAppliedToMessage(
  messageId: number,
  applied: WorldbookWriteAppliedEntry,
): Promise<void> {
  const msg = getChatMessages(messageId)[0];
  if (!msg) return;
  const data = (msg.data ?? {}) as Record<string, unknown>;
  const raw = data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
  const prev = Array.isArray(raw) ? [...(raw as WorldbookWriteAppliedEntry[])] : [];
  const { list } = upsertAppliedInList(prev, applied);
  await setChatMessages(
    [
      {
        message_id: messageId,
        data: { ...data, [POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY]: list },
      },
    ],
    { refresh: 'none' },
  );
}

export async function clearWorldbookWriteMessageKeys(messageId: number): Promise<void> {
  const msg = getChatMessages(messageId)[0];
  if (!msg) return;
  const data = { ...(msg.data ?? {}) } as Record<string, unknown>;
  delete data[POST_PROCESS_WORLDBOOK_WRITE_APPLIED_KEY];
  delete data[POST_PROCESS_WORLDBOOK_WRITE_SNAPSHOT_KEY];
  await setChatMessages([{ message_id: messageId, data }], { refresh: 'none' });
}
