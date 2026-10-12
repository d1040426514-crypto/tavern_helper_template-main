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

test('mergePersistedScriptSettings drops deleted rules, presets, bindings and hud position', () => {
  const current = {
    contextExtractRules: [{ start: '<gametxt', end: '</gametxt>' }],
    contextExcludeRules: [{ start: '<old', end: '</old>' }, { start: '<keep', end: '</keep>' }],
    chatBodyTagReplaceRules: [{ id: 'a' }, { id: 'b' }],
    chatWorldbookWriteRules: [{ id: 'w1' }, { id: 'w2' }],
    plotWorldbookConfig: {
      source: 'manual',
      manualSelection: ['book-a', 'book-b'],
      enabledEntries: { 'book-a': [1], 'book-b': [2] },
    },
    apiPresets: [{ name: '甲' }, { name: '乙' }],
    apiPresetBindingsByChat: { chat1: { presetName: '甲' }, chat2: { presetName: '乙' } },
    taskApiPresetOverridesById: { t1: '甲', t2: '乙' },
    scheduleState: { t1: { lastRunRound: 1 }, t2: { lastRunRound: 2 } },
    progressHudPosition: { x: 0.2, y: 0.3 },
    enabled: true,
  };
  const persisted = {
    contextExtractRules: [],
    contextExcludeRules: [{ start: '<keep', end: '</keep>' }],
    chatBodyTagReplaceRules: [{ id: 'a' }],
    chatWorldbookWriteRules: [],
    plotWorldbookConfig: {
      source: 'character',
      manualSelection: [],
      enabledEntries: {},
    },
    apiPresets: [{ name: '甲' }],
    apiPresetBindingsByChat: { chat1: { presetName: '甲' } },
    taskApiPresetOverridesById: { t1: '甲' },
    scheduleState: { t1: { lastRunRound: 3 } },
    progressHudPosition: null,
    enabled: true,
  };
  const next = mergePersistedScriptSettings(current, persisted);
  assert.deepEqual(next.contextExtractRules, []);
  assert.deepEqual(next.contextExcludeRules, [{ start: '<keep', end: '</keep>' }]);
  assert.deepEqual(next.chatBodyTagReplaceRules, [{ id: 'a' }]);
  assert.deepEqual(next.chatWorldbookWriteRules, []);
  assert.deepEqual(next.plotWorldbookConfig, {
    source: 'character',
    manualSelection: [],
    enabledEntries: {},
  });
  assert.deepEqual(next.apiPresets, [{ name: '甲' }]);
  assert.deepEqual(next.apiPresetBindingsByChat, { chat1: { presetName: '甲' } });
  assert.deepEqual(next.taskApiPresetOverridesById, { t1: '甲' });
  assert.deepEqual(next.scheduleState, { t1: { lastRunRound: 3 } });
  assert.equal(next.progressHudPosition, null);
  assert.equal(next.enabled, true);
});
