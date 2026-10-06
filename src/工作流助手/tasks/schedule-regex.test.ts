import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeTimeRawFailure, resolveTimeRaw, shouldRunTask, type ScheduleContext } from './schedule';
import type { PostProcessTask, ScriptSettings, TaskSchedule } from './schema';

function makeTask(schedule: TaskSchedule): PostProcessTask {
  return {
    id: 't1',
    name: 'task',
    enabled: true,
    stage: 1,
    extractInjectTags: ['result'],
    promptGroups: [],
    schedule,
  } as PostProcessTask;
}

function makeCtx(overrides?: Partial<ScheduleContext>): ScheduleContext {
  return {
    currentRound: 5,
    currentAiText: '',
    currentPairText: '',
    settings: { scheduleState: {} } as ScriptSettings,
    bypassSchedule: false,
    ...overrides,
  };
}

const hourInterval = {
  enabled: true,
  value: 1,
  unit: 'hour' as const,
};

describe('游戏时间正则匹配', () => {
  it('标签内文取出整段匹配后再解析', () => {
    const task = makeTask({
      mode: 'time',
      timeInterval: {
        ...hourInterval,
        matchPattern: '/时间[:：]\\s*.+/',
        timeSource: { type: 'message_tag', tagNames: ['time'], scope: 'current_ai' },
      },
    });
    const ctx = makeCtx({
      currentAiText: '旁白时间：第2天 09:00 <time>时间：第1天 08:00</time>',
      currentPairText: '旁白时间：第2天 09:00 <time>时间：第1天 08:00</time>',
    });
    assert.equal(resolveTimeRaw(task, ctx).raw, '时间：第1天 08:00');
    assert.equal(shouldRunTask(task, undefined, ctx).run, true);
  });

  it('标签名已填但标签缺失时不扫全文', () => {
    const task = makeTask({
      mode: 'time',
      timeInterval: {
        ...hourInterval,
        matchPattern: '/时间[:：]\\s*.+/',
        timeSource: { type: 'message_tag', tagNames: ['time'], scope: 'current_ai' },
      },
    });
    const ctx = makeCtx({
      currentAiText: '旁白里有时间：第1天 08:00',
      currentPairText: '旁白里有时间：第1天 08:00',
    });
    const check = shouldRunTask(task, undefined, ctx);
    assert.equal(check.run, false);
    assert.equal(check.reason, '读不到游戏时间，已跳过');
  });

  it('标签名为空时才扫全文', () => {
    const task = makeTask({
      mode: 'time',
      timeInterval: {
        ...hourInterval,
        matchPattern: '/时间[:：]\\s*第1天 08:00/',
        timeSource: { type: 'message_tag', tagNames: [], scope: 'current_ai' },
      },
    });
    const ctx = makeCtx({
      currentAiText: '前文 时间：第1天 08:00 后文',
      currentPairText: '前文 时间：第1天 08:00 后文',
    });
    assert.equal(resolveTimeRaw(task, ctx).raw, '时间：第1天 08:00');
    assert.equal(shouldRunTask(task, undefined, ctx).run, true);
  });

  it('未命中则跳过', () => {
    const task = makeTask({
      mode: 'time',
      timeInterval: {
        ...hourInterval,
        matchPattern: '/时间[:：]\\s*.+/',
        timeSource: { type: 'message_tag', tagNames: ['time'], scope: 'current_ai' },
      },
    });
    const ctx = makeCtx({
      currentAiText: '<time>不是时间</time>',
      currentPairText: '<time>不是时间</time>',
    });
    const resolved = resolveTimeRaw(task, ctx);
    assert.equal(resolved.failKind, 'regex_miss');
    const check = shouldRunTask(task, undefined, ctx);
    assert.equal(check.run, false);
    assert.equal(check.reason, '时间正则未命中，已跳过');
  });

  it('非法正则不再把原文解析成功', () => {
    const task = makeTask({
      mode: 'time',
      timeInterval: {
        ...hourInterval,
        matchPattern: '/[/',
        timeSource: { type: 'message_tag', tagNames: ['time'], scope: 'current_ai' },
      },
    });
    const ctx = makeCtx({
      currentAiText: '<time>第1天 08:00</time>',
      currentPairText: '<time>第1天 08:00</time>',
    });
    const resolved = resolveTimeRaw(task, ctx);
    assert.equal(resolved.failKind, 'regex_invalid');
    assert.equal(resolved.raw, null);
    const check = shouldRunTask(task, undefined, ctx);
    assert.equal(check.run, false);
    assert.equal(check.reason, '时间正则无效，已跳过');
  });

  it('标签名为空且正则非法时也是时间正则无效', () => {
    const task = makeTask({
      mode: 'time',
      timeInterval: {
        ...hourInterval,
        matchPattern: '/[/',
        timeSource: { type: 'message_tag', tagNames: [], scope: 'current_ai' },
      },
    });
    const ctx = makeCtx({
      currentAiText: '前文 第1天 08:00 后文',
      currentPairText: '前文 第1天 08:00 后文',
    });
    assert.equal(resolveTimeRaw(task, ctx).failKind, 'regex_invalid');
    assert.equal(shouldRunTask(task, undefined, ctx).reason, '时间正则无效，已跳过');
  });

  it('楼层变量只在变量字符串上匹配', () => {
    const previous = (globalThis as { getVariables?: (opt: unknown) => unknown }).getVariables;
    (globalThis as { getVariables?: (opt: unknown) => unknown }).getVariables = () => ({
      stat_data: { now: '前文 时间：第1天 08:00 后文' },
    });
    try {
      const task = makeTask({
        mode: 'time',
        timeInterval: {
          ...hourInterval,
          matchPattern: '/时间[:：]\\s*第1天 08:00/',
          timeSource: { type: 'variable', variableType: 'message', path: 'stat_data.now' },
        },
      });
      const ctx = makeCtx({ currentAiText: '时间：第2天 09:00' });
      assert.equal(resolveTimeRaw(task, ctx).raw, '时间：第1天 08:00');
      assert.equal(shouldRunTask(task, undefined, ctx).run, true);

      (globalThis as { getVariables?: (opt: unknown) => unknown }).getVariables = () => ({
        stat_data: { now: '' },
      });
      assert.equal(resolveTimeRaw(task, ctx).fail, true);
      assert.equal(resolveTimeRaw(task, ctx).failKind, 'missing');
    } finally {
      (globalThis as { getVariables?: (opt: unknown) => unknown }).getVariables = previous;
    }
  });
});

describe('时间读取失败提示', () => {
  const tagSource = { type: 'message_tag' as const, tagNames: ['time'], scope: 'current_ai' as const };
  const openSource = { type: 'message_tag' as const, tagNames: [], scope: 'current_ai' as const };
  const variableSource = { type: 'variable' as const, variableType: 'message' as const, path: 'stat_data.now' };

  it('测试时间解析按失败类型区分来源', () => {
    assert.equal(describeTimeRawFailure('missing', tagSource, 'probe'), '未在正文中读到时间标签：time');
    assert.equal(describeTimeRawFailure('missing', variableSource, 'probe'), '未读到楼层变量时间：message / stat_data.now');
    assert.equal(describeTimeRawFailure('regex_invalid', tagSource, 'probe'), '时间正则无效');
    assert.equal(describeTimeRawFailure('regex_miss', tagSource, 'probe'), '已读到标签内容，但正则未命中');
    assert.equal(describeTimeRawFailure('regex_miss', variableSource, 'probe'), '已读到变量内容，但正则未命中');
    assert.equal(describeTimeRawFailure('regex_miss', openSource, 'probe'), '正则未在当前扫描全文中命中');
  });
});
