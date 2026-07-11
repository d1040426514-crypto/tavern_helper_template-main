import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatWorldbookWriteRule } from '../tasks/schema';
import {
  customEntryNamePrefix,
  isManagedWorldbookEntryName,
  ledgerEntryKey,
  ledgerStableNamesForBook,
  mergeAppliedLedgerEntries,
  shouldDeleteManagedEntryAsOrphan,
} from './write-reconcile';
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

function applied(stableName: string, content: string, bookName = 'BookA'): WorldbookWriteAppliedEntry {
  return {
    ruleId: 'r1',
    bookName,
    stableName,
    partial: { name: stableName, content, enabled: true },
  };
}

test('mergeAppliedLedgerEntries last-write-wins for same stableName', () => {
  const merged = mergeAppliedLedgerEntries([
    [applied('WorkflowHelper-content', 'first')],
    [applied('WorkflowHelper-content', 'second')],
  ]);
  assert.equal(merged.size, 1);
  assert.equal(merged.get(ledgerEntryKey('BookA', 'WorkflowHelper-content'))?.partial.content, 'second');
});

test('mergeAppliedLedgerEntries keeps distinct stable names', () => {
  const merged = mergeAppliedLedgerEntries([
    [applied('WorkflowHelper-a', 'a'), applied('WorkflowHelper-b', 'b')],
  ]);
  assert.equal(merged.size, 2);
});

test('isManagedWorldbookEntryName matches WorkflowHelper prefix', () => {
  const rules = [baseRule()];
  assert.equal(isManagedWorldbookEntryName('WorkflowHelper-content', rules), true);
  assert.equal(isManagedWorldbookEntryName('ManualEntry', rules), false);
});

test('isManagedWorldbookEntryName matches custom entryName prefix', () => {
  const rules = [baseRule({ entryName: 'MyEntry-{attrValue}' })];
  assert.equal(isManagedWorldbookEntryName('MyEntry-断剑', rules), true);
  assert.equal(customEntryNamePrefix(rules[0]!), 'MyEntry-');
});

test('isManagedWorldbookEntryName custom without placeholder', () => {
  const rules = [baseRule({ entryName: 'CustomPrefix' })];
  assert.equal(isManagedWorldbookEntryName('CustomPrefix-foo', rules), true);
});

test('shouldDeleteManagedEntryAsOrphan deletes only ledger orphans', () => {
  const rules = [baseRule()];
  const keep = new Set(['WorkflowHelper-a']);
  assert.equal(shouldDeleteManagedEntryAsOrphan('WorkflowHelper-a', rules, keep), false);
  assert.equal(shouldDeleteManagedEntryAsOrphan('WorkflowHelper-b', rules, keep), true);
  assert.equal(shouldDeleteManagedEntryAsOrphan('ManualEntry', rules, keep), false);
});

test('ledgerStableNamesForBook filters by book', () => {
  const ledger = mergeAppliedLedgerEntries([
    [applied('WorkflowHelper-a', 'a', 'BookA'), applied('WorkflowHelper-b', 'b', 'BookB')],
  ]);
  const names = ledgerStableNamesForBook(ledger, 'BookA');
  assert.deepEqual([...names], ['WorkflowHelper-a']);
});

console.log('write-reconcile.test.ts: all passed');
