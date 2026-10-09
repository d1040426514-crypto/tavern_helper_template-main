import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  beginTemplateProcessMemo,
  endTemplateProcessMemo,
  hasEjsTemplateTags,
  processTemplateText,
} from './template-process';

function installTemplateGlobals(options: {
  macro?: (text: string) => string;
  prepare?: () => Promise<Record<string, unknown>>;
  evaltemplate?: (text: string) => Promise<string>;
}): { macroCalls: number; prepareCalls: number } {
  const stats = { macroCalls: 0, prepareCalls: 0 };
  const g = globalThis as typeof globalThis & {
    formatAsTavernRegexedString: (
      text: string,
      source: string,
      kind: string,
      extra?: Record<string, unknown>,
    ) => string;
    substitudeMacros: (text: string) => string;
    getLastMessageId: () => number;
    EjsTemplate: {
      prepareContext: (env: Record<string, unknown>, messageId: number) => Promise<Record<string, unknown>>;
      evaltemplate: (code: string, context?: Record<string, unknown>) => Promise<string>;
    };
  };
  g.formatAsTavernRegexedString = text => {
    stats.macroCalls += 1;
    return (options.macro ?? ((t: string) => t))(text);
  };
  g.substitudeMacros = text => text;
  g.getLastMessageId = () => 1;
  g.EjsTemplate = {
    prepareContext: async () => {
      stats.prepareCalls += 1;
      return options.prepare ? options.prepare() : {};
    },
    evaltemplate: async text => (options.evaltemplate ? options.evaltemplate(text) : `${text}|ejs`),
  };
  return stats;
}

test('hasEjsTemplateTags detects EJS open tags', () => {
  assert.equal(hasEjsTemplateTags('plain'), false);
  assert.equal(hasEjsTemplateTags('<% x %>'), true);
  assert.equal(hasEjsTemplateTags('<%= a _%>'), true);
});

test('processTemplateText skips EJS when text has no EJS tags', async () => {
  const stats = installTemplateGlobals({
    macro: text => `${text}|macro`,
    evaltemplate: async text => `${text}|ejs`,
  });
  const out = await processTemplateText('世界开始', 0, { source: 'slash_command' });
  assert.equal(out, '世界开始|macro|macro');
  assert.equal(stats.prepareCalls, 0);
  assert.equal(stats.macroCalls, 2);
});

test('processTemplateText runs EJS and a second macro pass when tags exist', async () => {
  const stats = installTemplateGlobals({
    macro: text => `${text}|m`,
    evaltemplate: async text => `${text}|ejs`,
  });
  const out = await processTemplateText('<% x %>', 0, { source: 'slash_command' });
  assert.equal(out, '<% x %>|m|ejs|m');
  assert.equal(stats.prepareCalls, 1);
  assert.equal(stats.macroCalls, 2);
});

test('processTemplateText uses parent evalTemplate when the script has no EjsTemplate', async () => {
  const g = globalThis as typeof globalThis & {
    EjsTemplate?: unknown;
    window?: { parent?: { EjsTemplate?: unknown } };
    formatAsTavernRegexedString: (text: string) => string;
    substitudeMacros: (text: string) => string;
    getLastMessageId: () => number;
  };
  const prev = {
    EjsTemplate: g.EjsTemplate,
    window: g.window,
    formatAsTavernRegexedString: g.formatAsTavernRegexedString,
    substitudeMacros: g.substitudeMacros,
    getLastMessageId: g.getLastMessageId,
  };
  let evalCalls = 0;
  let preparedMessageId = -1;
  g.formatAsTavernRegexedString = text => text;
  g.substitudeMacros = text => text;
  g.getLastMessageId = () => 1;
  delete g.EjsTemplate;
  g.window = {
    parent: {
      EjsTemplate: {
        prepareContext: async (_env: Record<string, unknown>, messageId: number) => {
          preparedMessageId = messageId;
          return {};
        },
        evalTemplate: async (text: string) => {
          evalCalls += 1;
          return `${text}|parent`;
        },
      },
    },
  };
  try {
    const out = await processTemplateText('<% x %>', 4, { source: 'slash_command' });
    assert.equal(out, '<% x %>|parent');
    assert.equal(evalCalls, 1);
    assert.equal(preparedMessageId, 4);
  } finally {
    g.EjsTemplate = prev.EjsTemplate;
    g.window = prev.window;
    g.formatAsTavernRegexedString = prev.formatAsTavernRegexedString;
    g.substitudeMacros = prev.substitudeMacros;
    g.getLastMessageId = prev.getLastMessageId;
  }
});

test('processTemplateText keeps original text when no EjsTemplate is available', async () => {
  const g = globalThis as typeof globalThis & {
    EjsTemplate?: unknown;
    window?: { parent?: Record<string, unknown> };
    formatAsTavernRegexedString: (text: string) => string;
    substitudeMacros: (text: string) => string;
    getLastMessageId: () => number;
  };
  const prev = {
    EjsTemplate: g.EjsTemplate,
    window: g.window,
    formatAsTavernRegexedString: g.formatAsTavernRegexedString,
    substitudeMacros: g.substitudeMacros,
    getLastMessageId: g.getLastMessageId,
  };
  g.formatAsTavernRegexedString = text => text;
  g.substitudeMacros = text => text;
  g.getLastMessageId = () => 1;
  delete g.EjsTemplate;
  g.window = { parent: {} };
  try {
    const out = await processTemplateText('<% x %>', 0, { source: 'slash_command' });
    assert.equal(out, '<% x %>');
  } finally {
    g.EjsTemplate = prev.EjsTemplate;
    g.window = prev.window;
    g.formatAsTavernRegexedString = prev.formatAsTavernRegexedString;
    g.substitudeMacros = prev.substitudeMacros;
    g.getLastMessageId = prev.getLastMessageId;
  }
});

test('processTemplateText keeps original text when EJS evaluation throws', async () => {
  installTemplateGlobals({
    evaltemplate: async () => {
      throw new Error('模板语法错误');
    },
  });
  const out = await processTemplateText('<% x %>', 0, { source: 'slash_command' });
  assert.equal(out, '<% x %>');
});

test('processTemplateText memoizes identical inputs within a run', async () => {
  const stats = installTemplateGlobals({
    macro: text => `${text}|m`,
  });
  beginTemplateProcessMemo();
  try {
    const a = await processTemplateText('相同段落', 7, { source: 'slash_command' });
    const b = await processTemplateText('相同段落', 7, { source: 'slash_command' });
    assert.equal(a, b);
    assert.equal(a, '相同段落|m|m');
    assert.equal(stats.macroCalls, 2);
    await processTemplateText('另一段落', 7, { source: 'slash_command' });
    assert.equal(stats.macroCalls, 4);
  } finally {
    endTemplateProcessMemo();
  }
});

test('processTemplateText still memoizes deterministic char and user macros', async () => {
  const stats = installTemplateGlobals({
    macro: text => text.replaceAll('{{char}}', '角色').replaceAll('{{user}}', '用户'),
  });
  beginTemplateProcessMemo();
  try {
    const first = await processTemplateText('你好{{char}}，{{user}}', 3, { source: 'slash_command' });
    const second = await processTemplateText('你好{{char}}，{{user}}', 3, { source: 'slash_command' });
    assert.equal(first, '你好角色，用户');
    assert.equal(second, first);
    assert.equal(stats.macroCalls, 2);
  } finally {
    endTemplateProcessMemo();
  }
});

test('processTemplateText still memoizes deterministic reverse macros', async () => {
  const stats = installTemplateGlobals({
    macro: text => text.replaceAll('{{reverse::文字}}', '字文'),
  });
  beginTemplateProcessMemo();
  try {
    const first = await processTemplateText('{{reverse::文字}}', 3, { source: 'slash_command' });
    const second = await processTemplateText('{{reverse::文字}}', 3, { source: 'slash_command' });
    assert.equal(first, '字文');
    assert.equal(second, first);
    assert.equal(stats.macroCalls, 2);
  } finally {
    endTemplateProcessMemo();
  }
});

test('processTemplateText reexecutes setvar after an intervening clear', async () => {
  const vars = new Map<string, string>();
  installTemplateGlobals({
    macro: text =>
      text
        .replace(/\{\{setvar::([^:}]+)::([\s\S]*?)\}\}/g, (_match, name: string, value: string) => {
          vars.set(name, value);
          return '';
        })
        .replace(/\{\{getvar::([^:}]+)\}\}/g, (_match, name: string) => vars.get(name) ?? ''),
  });
  beginTemplateProcessMemo();
  try {
    const assign = '{{setvar::情感生活增强::规则正文}}';
    await processTemplateText(assign, 7, { source: 'slash_command' });
    assert.equal(vars.get('情感生活增强'), '规则正文');

    await processTemplateText('{{setvar::情感生活增强::}}', 7, { source: 'slash_command' });
    assert.equal(vars.get('情感生活增强'), '');

    await processTemplateText(assign, 7, { source: 'slash_command' });
    assert.equal(vars.get('情感生活增强'), '规则正文');

    const read = await processTemplateText('前缀{{getvar::情感生活增强}}后缀', 7, { source: 'slash_command' });
    assert.equal(read, '前缀规则正文后缀');

    await processTemplateText('{{setvar::情感生活增强::}}', 7, { source: 'slash_command' });
    const readAgain = await processTemplateText('前缀{{getvar::情感生活增强}}后缀', 7, { source: 'slash_command' });
    assert.equal(readAgain, '前缀后缀');
  } finally {
    endTemplateProcessMemo();
  }
});

test('processTemplateText does not memoize EJS templates', async () => {
  let evalCalls = 0;
  const stats = installTemplateGlobals({
    macro: text => text,
    evaltemplate: async text => {
      evalCalls += 1;
      return `${text}|${evalCalls}`;
    },
  });
  beginTemplateProcessMemo();
  try {
    const first = await processTemplateText('<% x %>', 7, { source: 'slash_command' });
    const second = await processTemplateText('<% x %>', 7, { source: 'slash_command' });
    assert.equal(first, '<% x %>|1');
    assert.equal(second, '<% x %>|2');
    assert.equal(evalCalls, 2);
    assert.equal(stats.macroCalls, 4);
  } finally {
    endTemplateProcessMemo();
  }
});

test('processTemplateText does not memoize stateful tavern macros', async () => {
  const samples = [
    '{{getglobalvar::情感生活增强}}',
    '{{addvar::n::1}}',
    '{{incvar::n}}',
    '{{decglobalvar::n}}',
    '{{deletevar::n}}',
    '{{flushvar::n}}',
    '{{roll:1d6}}',
    '{{random::a,b}}',
    '{{pick::a}}',
    '{{time}}',
    '{{date}}',
    '{{weekday}}',
    '{{isotime}}',
    '{{isodate}}',
    '{{datetime}}',
    '{{datetimeformat::YYYY}}',
    '{{idleDuration}}',
    '{{idle_duration}}',
    '{{timeDiff::a::b}}',
    '{{time_UTC+8}}',
    '{{hasvar::x}}',
    '{{hasglobalvar::x}}',
    '{{.counter++}}',
    '{{$name}}',
    '{{get_message_variable::stat_data}}',
    '{{format_chat_variable::商品}}',
    '{{format_message_variable_quoted::体力}}',
    '{{get_global_variable::x}}',
    '{{total:item@id}}',
    '{{replica:launched:任务}}',
  ];
  for (const sample of samples) {
    let calls = 0;
    installTemplateGlobals({
      macro: text => {
        calls += 1;
        return `${text}#${calls}`;
      },
    });
    beginTemplateProcessMemo();
    try {
      const first = await processTemplateText(sample, 1, { source: 'slash_command' });
      const second = await processTemplateText(sample, 1, { source: 'slash_command' });
      assert.notEqual(first, second, sample);
    } finally {
      endTemplateProcessMemo();
    }
  }
});
