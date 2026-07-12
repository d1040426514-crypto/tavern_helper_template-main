import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatWorldbookWriteRule } from '../tasks/schema';
import { removeTagKeyFromRawContainer } from '../tasks/tag-variables-nested';
import {
  collectAppliedLedgerWithOwnersFromBatches,
  extractTagInnerFromWorldbookContent,
  resolveTagKeyForRow,
} from './run-log-worldbook-sync-utils';
import type { WorldbookWriteAppliedEntry } from './write-sync';

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

function applied(stableName: string, bookName = 'BookA', ruleId = 'r1'): WorldbookWriteAppliedEntry {
  return {
    ruleId,
    bookName,
    stableName,
    partial: { name: stableName, content: 'content', enabled: true },
  };
}

test('collectAppliedLedgerWithOwnersFromBatches last floor wins owner', () => {
  const merged = collectAppliedLedgerWithOwnersFromBatches([
    { messageId: 1, entries: [applied('WorkflowHelper-item name-圣剑')] },
    { messageId: 3, entries: [applied('WorkflowHelper-item name-圣剑', 'BookA', 'r1')] },
  ]);
  assert.equal(merged.size, 1);
  const entry = merged.values().next().value!;
  assert.equal(entry.ownerMessageId, 3);
  assert.equal(entry.partial.content, 'content');
});

test('collectAppliedLedgerWithOwnersFromBatches keeps distinct stable names', () => {
  const merged = collectAppliedLedgerWithOwnersFromBatches([
    {
      messageId: 2,
      entries: [
        applied('WorkflowHelper-item name-圣剑'),
        applied('WorkflowHelper-item name-断剑'),
      ],
    },
  ]);
  assert.equal(merged.size, 2);
});

test('resolveTagKeyForRow splitByAttr from owner tags', () => {
  const rule = baseRule();
  const key = resolveTagKeyForRow(rule, 'WorkflowHelper-item name-圣剑', {
    'item@name=圣剑': 'inner',
  });
  assert.equal(key, 'item@name=圣剑');
});

test('resolveTagKeyForRow splitByAttr infers from stableName', () => {
  const rule = baseRule();
  const key = resolveTagKeyForRow(rule, 'WorkflowHelper-item name-断剑', {});
  assert.equal(key, 'item@name=断剑');
});

test('resolveTagKeyForRow bare tag', () => {
  const rule = baseRule({ targetTag: 'result', splitByAttr: false });
  const key = resolveTagKeyForRow(rule, 'WorkflowHelper-result', {});
  assert.equal(key, 'result');
});

test('extractTagInnerFromWorldbookContent parses full tag block', () => {
  const inner = extractTagInnerFromWorldbookContent(
    'result',
    '<result>\nhello\n</result>',
  );
  assert.equal(inner, 'hello');
});

test('extractTagInnerFromWorldbookContent keeps plain text', () => {
  const inner = extractTagInnerFromWorldbookContent('result', 'plain text');
  assert.equal(inner, 'plain text');
});

test('removeTagKeyFromRawContainer removes nested composite key', () => {
  const raw = removeTagKeyFromRawContainer(
    { item_name: { 圣剑: 'a', 断剑: 'b' }, 'item@name=圣剑': 'a' },
    'item@name=圣剑',
  );
  assert.deepEqual(raw.item_name, { 断剑: 'b' });
  assert.equal(raw['item@name=圣剑'], undefined);
});

console.log('run-log-worldbook-sync.test.ts: all passed');
