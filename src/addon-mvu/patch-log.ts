import type { MvuJsonPatchOp, PatchIssue } from './patch';

export type AddonPatchFailedFragment = {
  /** 1-based 展示序号 */
  index: number;
  /** 残缺/非法 JSON 原文，供控制台编辑 */
  snippet: string;
  message: string;
};

export type AddonPatchLogEntry = {
  messageId?: number;
  timestamp: number;
  ops: MvuJsonPatchOp[];
  issues: PatchIssue[];
  failedFragments: AddonPatchFailedFragment[];
  changed: boolean;
};

let lastPatchLog: AddonPatchLogEntry | null = null;

export function getLastPatchLog(): AddonPatchLogEntry | null {
  return lastPatchLog;
}

export function setLastPatchLog(entry: AddonPatchLogEntry): void {
  lastPatchLog = entry;
}

export function clearPatchLog(): void {
  lastPatchLog = null;
}

export function createPatchLogEntry(
  partial: Omit<AddonPatchLogEntry, 'timestamp'> & { timestamp?: number },
): AddonPatchLogEntry {
  return {
    messageId: partial.messageId,
    timestamp: partial.timestamp ?? Date.now(),
    ops: partial.ops,
    issues: partial.issues,
    failedFragments: partial.failedFragments,
    changed: partial.changed,
  };
}
