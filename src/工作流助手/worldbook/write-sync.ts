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
