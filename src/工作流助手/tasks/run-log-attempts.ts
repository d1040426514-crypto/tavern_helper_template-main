export interface RunLogAttemptSource {
  skipped?: boolean;
  skipReason?: string;
  success?: boolean;
  apiAttemptCount?: number;
  apiAcceptedAttempt?: number;
  apiAttemptFailures?: { attempt: number; reason: string }[];
}

export interface RunLogAttemptRow {
  label: string;
  value: string;
}

/** 展开区与导出共用。第一次就成功时返回空，调用方不渲染这块。 */
export function buildRunLogAttemptRows(task: RunLogAttemptSource): RunLogAttemptRow[] {
  if (task.skipped) {
    return task.skipReason ? [{ label: '说明', value: task.skipReason }] : [];
  }

  const failures = task.apiAttemptFailures ?? [];
  const count = task.apiAttemptCount ?? 0;
  if (task.success && failures.length === 0) return [];
  if (!task.success && failures.length === 0) {
    return task.skipReason ? [{ label: '原因', value: task.skipReason }] : [];
  }

  const sameReason = failures.every(item => item.reason === failures[0]!.reason);
  if (sameReason) {
    const rows: RunLogAttemptRow[] = [];
    if (count > 0) rows.push({ label: '请求', value: `${count} 次` });
    rows.push({ label: '原因', value: failures[0]!.reason });
    if (task.apiAcceptedAttempt) {
      rows.push({ label: '结果', value: `第 ${task.apiAcceptedAttempt} 次成功` });
    }
    return rows;
  }

  const rows = failures.map(item => ({
    label: `第 ${item.attempt} 次`,
    value: item.reason,
  }));
  if (task.apiAcceptedAttempt) {
    rows.push({ label: `第 ${task.apiAcceptedAttempt} 次`, value: '成功' });
  }
  return rows;
}
