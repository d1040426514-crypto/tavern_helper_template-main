import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildWorldbookEntryPartial,
  defaultWorldbookEntryName,
  resolveEntryKeys,
  resolveStableEntryName,
  resolveWorldbookWriteContent,
  resolveWriteTargetBookName,
} from './write-from-template';
import type { ChatWorldbookWriteRule } from '../tasks/schema';

function baseRule(overrides: Partial<ChatWorldbookWriteRule> = {}): ChatWorldbookWriteRule {
  return {
    id: 'r1',
    targetTag: 'item@name',
    template: '{{item@name}}',
    entryName: '',
    bookSource: 'character',
    manualBookName: '',
    entryType: 'keyword',
    keywords: '',
    splitByAttr: true,
    placement: { position: 'at_depth_as_system', depth: 2, order: 10000 },
    preventRecursion: true,
    ...overrides,
  };
}

test('resolveStableEntryName splitByAttr uses tag attr and value', () => {
  const name = resolveStableEntryName(baseRule(), '断剑');
  assert.equal(name, 'WorkflowHelper-item name-断剑');
});

test('resolveStableEntryName bare tag uses tag name only', () => {
  const name = resolveStableEntryName(baseRule({ targetTag: 'content', splitByAttr: false }));
  assert.equal(name, 'WorkflowHelper-content');
});

test('resolveStableEntryName custom entryName with attrValue placeholder', () => {
  const name = resolveStableEntryName(
    baseRule({ entryName: 'MyEntry-{attrValue}' }),
    '断剑',
  );
  assert.equal(name, 'MyEntry-断剑');
});

test('resolveStableEntryName custom entryName appends attr when splitByAttr', () => {
  const name = resolveStableEntryName(baseRule({ entryName: 'MyEntry' }), '断剑');
  assert.equal(name, 'MyEntry-断剑');
});

test('defaultWorldbookEntryName matches empty entryName resolve', () => {
  const rule = baseRule();
  assert.equal(defaultWorldbookEntryName(rule, '断剑'), resolveStableEntryName(rule, '断剑'));
});

test('resolveWorldbookWriteContent split keeps full tag block with newlines', () => {
  const content = resolveWorldbookWriteContent(
    'item@name=断剑',
    { 'item@name=断剑': '锈迹斑斑' },
    '',
    true,
  );
  assert.equal(content, '<item name="断剑">\n锈迹斑斑\n</item>');
});

test('resolveWorldbookWriteContent non-split uses rendered as-is', () => {
  const rendered = '<content>polished</content>';
  const content = resolveWorldbookWriteContent('content', {}, rendered, false);
  assert.equal(content, rendered);
});

test('resolveEntryKeys binds attrValue for keyword splitByAttr', () => {
  const keys = resolveEntryKeys(baseRule(), 'item@name=圣剑');
  assert.deepEqual(keys, ['圣剑']);
});

test('resolveEntryKeys merges static keywords', () => {
  const keys = resolveEntryKeys(baseRule({ keywords: 'foo,bar' }), 'item@name=圣剑');
  assert.deepEqual(keys, ['圣剑', 'foo', 'bar']);
});

test('resolveEntryKeys bare tag keyword defaults to tag name', () => {
  const keys = resolveEntryKeys(baseRule({ targetTag: 'result', splitByAttr: false }));
  assert.deepEqual(keys, ['result']);
});

test('buildWorldbookEntryPartial keyword selective', () => {
  const partial = buildWorldbookEntryPartial(baseRule(), 'content', 'item@name=圣剑');
  assert.equal(partial.strategy?.type, 'selective');
  assert.deepEqual(partial.strategy?.keys, ['圣剑']);
  assert.equal(partial.position?.type, 'at_depth');
  assert.equal(partial.position?.depth, 2);
});

test('buildWorldbookEntryPartial before_char position', () => {
  const partial = buildWorldbookEntryPartial(
    baseRule({
      placement: { position: 'before_character_definition', depth: 2, order: 10000 },
    }),
    'content',
  );
  assert.equal(partial.position?.type, 'before_character_definition');
  assert.equal(partial.position?.depth, 0);
});

test('buildWorldbookEntryPartial custom order', () => {
  const partial = buildWorldbookEntryPartial(
    baseRule({ placement: { position: 'at_depth_as_system', depth: 2, order: 42 } }),
    'content',
  );
  assert.equal(partial.position?.order, 42);
});

test('buildWorldbookEntryPartial invalid order falls back to minimum 1', () => {
  const partial = buildWorldbookEntryPartial(
    baseRule({ placement: { position: 'at_depth_as_system', depth: 2, order: 0 } }),
    'content',
  );
  assert.equal(partial.position?.order, 1);
});

test('buildWorldbookEntryPartial preventRecursion maps to prevent_outgoing', () => {
  const on = buildWorldbookEntryPartial(baseRule({ preventRecursion: true }), 'content');
  const off = buildWorldbookEntryPartial(baseRule({ preventRecursion: false }), 'content');
  assert.equal(on.recursion?.prevent_outgoing, true);
  assert.equal(off.recursion?.prevent_outgoing, false);
});

test('resolveWriteTargetBookName manual', () => {
  assert.equal(resolveWriteTargetBookName(baseRule({ bookSource: 'manual', manualBookName: 'MyBook' })), 'MyBook');
  assert.equal(resolveWriteTargetBookName(baseRule({ bookSource: 'manual', manualBookName: '' })), null);
});

console.log('write-from-template.test.ts: all passed');
