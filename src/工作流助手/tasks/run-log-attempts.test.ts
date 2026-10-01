import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRunLogAttemptRows } from './run-log-attempts';

describe('buildRunLogAttemptRows', () => {
  it('第一次成功不显示', () => {
    assert.deepEqual(buildRunLogAttemptRows({ success: true, apiAttemptCount: 1, apiAcceptedAttempt: 1 }), []);
  });

  it('跳过只保留说明', () => {
    assert.deepEqual(buildRunLogAttemptRows({ skipped: true, skipReason: '未到间隔', success: false }), [
      { label: '说明', value: '未到间隔' },
    ]);
  });

  it('原因相同合并成一次', () => {
    assert.deepEqual(
      buildRunLogAttemptRows({
        success: false,
        apiAttemptCount: 3,
        apiAttemptFailures: [
          { attempt: 1, reason: 'API 请求超时（300s）' },
          { attempt: 2, reason: 'API 请求超时（300s）' },
          { attempt: 3, reason: 'API 请求超时（300s）' },
        ],
      }),
      [
        { label: '请求', value: '3 次' },
        { label: '原因', value: 'API 请求超时（300s）' },
      ],
    );
  });

  it('原因不同逐次列出，并补上成功的那一次', () => {
    assert.deepEqual(
      buildRunLogAttemptRows({
        success: true,
        apiAttemptCount: 3,
        apiAcceptedAttempt: 3,
        apiAttemptFailures: [
          { attempt: 1, reason: 'API 请求超时（300s）' },
          { attempt: 2, reason: '响应过短' },
        ],
      }),
      [
        { label: '第 1 次', value: 'API 请求超时（300s）' },
        { label: '第 2 次', value: '响应过短' },
        { label: '第 3 次', value: '成功' },
      ],
    );
  });
});
