import assert from 'node:assert/strict';
import { shouldRunTask, updateScheduleStateAfterRun, type ScheduleContext } from './schedule';
import type { PostProcessTask, ScriptSettings } from './schema';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

function makeTask(schedule: PostProcessTask['schedule']): PostProcessTask {
  return {
    id: 't1',
    name: 'task',
    enabled: true,
    stage: 1,
    extractInjectTags: ['result'],
    promptGroups: [],
    schedule,
  };
}

function makeCtx(overrides?: Partial<ScheduleContext>): ScheduleContext {
  return {
    currentRound: 5,
    currentAiText: '<time>第1天 08:00</time>',
    currentPairText: '<time>第1天 08:00</time>',
    settings: { scheduleState: {} } as ScriptSettings,
    bypassSchedule: false,
    ...overrides,
  };
}

test('round interval 0 runs every floor', () => {
  const task = makeTask({ mode: 'round', roundInterval: 0 });
  const ctx = makeCtx({ currentRound: 3 });
  assert.equal(shouldRunTask(task, undefined, ctx).run, true);
});

test('round interval 3 skips until gap met', () => {
  const task = makeTask({ mode: 'round', roundInterval: 3 });
  const ctx = makeCtx({ currentRound: 5 });
  assert.equal(shouldRunTask(task, { lastRunRound: 5 }, ctx).run, false);
  assert.equal(shouldRunTask(task, { lastRunRound: 2 }, ctx).run, true);
});

test('round interval heals stale lastRunRound above currentRound', () => {
  const task = makeTask({ mode: 'round', roundInterval: 2 });
  const state = { lastRunRound: 6, lastRunAt: 1 };
  const ctx = makeCtx({ currentRound: 4 });
  const check = shouldRunTask(task, state, ctx);
  assert.equal(state.lastRunRound, 4);
  assert.equal(check.run, false);
  assert.equal(check.reason, '回合间隔未到 (0/2)');
  assert.equal(shouldRunTask(task, state, makeCtx({ currentRound: 6 })).run, true);
});

test('time mode with message tag runs when parse ok', () => {
  const task = makeTask({
    mode: 'time',
    timeInterval: {
      enabled: true,
      value: 1,
      unit: 'hour',
      timeSource: { type: 'message_tag', tagNames: ['time'], scope: 'current_ai' },
      onParseFail: 'skip',
    },
  });
  const ctx = makeCtx();
  assert.equal(shouldRunTask(task, undefined, ctx).run, true);
});

test('time mode skip on parse fail', () => {
  const task = makeTask({
    mode: 'time',
    timeInterval: {
      enabled: true,
      value: 1,
      unit: 'hour',
      timeSource: { type: 'message_tag', tagNames: ['missing'], scope: 'current_ai' },
      onParseFail: 'skip',
    },
  });
  const ctx = makeCtx();
  const check = shouldRunTask(task, undefined, ctx);
  assert.equal(check.run, false);
  assert.equal(check.reason, '游戏时间解析失败');
});

test('updateScheduleStateAfterRun records round and game time', () => {
  const settings = { scheduleState: {} } as ScriptSettings;
  const task = makeTask({
    mode: 'time',
    timeInterval: {
      enabled: true,
      value: 1,
      unit: 'hour',
      timeSource: { type: 'message_tag', tagNames: ['time'], scope: 'current_ai' },
      onParseFail: 'skip',
    },
  });
  const ctx = makeCtx({ currentRound: 7 });
  updateScheduleStateAfterRun(settings, task, ctx);
  assert.equal(settings.scheduleState.t1?.lastRunRound, 7);
  assert.ok(settings.scheduleState.t1?.lastRunGameTimeRaw);
});

if (process.exitCode) process.exit(process.exitCode);
