import assert from 'node:assert/strict';
import { test } from 'node:test';
import lodash from 'lodash';
import { mergePersistedScriptSettings } from './settings-save-merge';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

test('mergePersistedScriptSettings replaces cleanup counts instead of keeping old keys', () => {
  const current = {
    enabled: true,
    replicaFamilyCleanup: {
      enabled: true,
      cycleRounds: 10,
      cycleRunCounts: { a: 1, b: 2 },
      cycleOpportunityCounts: { a: 1 },
      roundsSinceCleanup: 4,
    },
  };
  const persisted = {
    enabled: true,
    replicaFamilyCleanup: {
      enabled: true,
      cycleRounds: 10,
      cycleRunCounts: {},
      cycleOpportunityCounts: {},
      cycleScheduleWaitCounts: {},
      roundsSinceCleanup: 0,
      lastCleanupRound: 0,
      lastManualKeepBySpec: {},
    },
  };
  const next = mergePersistedScriptSettings(current, persisted);
  assert.deepEqual(next.replicaFamilyCleanup.cycleRunCounts, {});
  assert.equal(next.replicaFamilyCleanup.roundsSinceCleanup, 0);
  assert.equal(next.enabled, true);
});

test('mergePersistedScriptSettings replaces task lists and extract tags wholesale', () => {
  const current = {
    tasks: [{ name: '前台角色' }, { name: '前台角色 阿露卡' }, { name: '资产账本' }, { name: '资产账本' }],
    chatExtractTags: { user: ['StoryEngine'], assistant: ['gametxt'] },
    presets: [{ name: '甲', tasks: [{ name: '旧任务' }, { name: '残留' }] }],
  };
  const persisted = {
    tasks: [{ name: '前台角色' }, { name: '后台角色' }, { name: '资产账本' }],
    chatExtractTags: { user: ['StoryEngine'], assistant: [] },
    presets: [{ name: '甲', tasks: [{ name: '前台角色' }, { name: '后台角色' }] }],
  };
  const next = mergePersistedScriptSettings(current, persisted);
  assert.deepEqual(
    next.tasks.map(task => task.name),
    ['前台角色', '后台角色', '资产账本'],
  );
  assert.deepEqual(next.chatExtractTags.assistant, []);
  assert.deepEqual(
    next.presets[0]?.tasks.map(task => task.name),
    ['前台角色', '后台角色'],
  );
});

test('mergePersistedScriptSettings replaces lastRunStatus wholesale', () => {
  const current = {
    lastRunStatus: {
      messageId: 6,
      at: 1,
      taskResults: [
        { taskId: 'a', taskName: '角色筛选与交互', skipped: true, success: true },
        { taskId: 'b', taskName: '前台角色 弗洛洛', skipped: true, success: true },
        { taskId: 'c', taskName: '后台角色 莫尔', skipped: true, success: true },
        { taskId: 'd', taskName: '前台角色 莫尔', success: true },
      ],
    },
  };
  const persisted = {
    lastRunStatus: {
      messageId: 6,
      at: 1,
      taskResults: [
        { taskId: 'a', taskName: '角色筛选与交互', success: true },
        { taskId: 'b', taskName: '前台角色 弗洛洛', success: true },
        { taskId: 'c', taskName: '后台角色 莫尔', success: true },
      ],
    },
  };
  const next = mergePersistedScriptSettings(current, persisted);
  assert.deepEqual(
    next.lastRunStatus.taskResults.map(task => task.taskName),
    ['角色筛选与交互', '前台角色 弗洛洛', '后台角色 莫尔'],
  );
  assert.equal(next.lastRunStatus.taskResults[0]?.skipped, undefined);
});
