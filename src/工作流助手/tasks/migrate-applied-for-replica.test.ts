import assert from 'node:assert/strict';
import type { ChatWorldbookWriteRule } from './schema';
import {
  computeReplicaAttrRenameTargets,
  rewriteAppliedEntryForAttrRename,
  rewriteAppliedListForAttrRename,
  rewriteSnapshotListForAttrRename,
} from './migrate-applied-for-replica';
import type { WorldbookWriteAppliedEntry } from '../worldbook/write-sync';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

function baseRule(overrides: Partial<ChatWorldbookWriteRule> = {}): ChatWorldbookWriteRule {
  return {
    id: 'rule-1',
    targetTag: 'item@id',
    template: '',
    entryName: '',
    bookSource: 'manual',
    manualBookName: 'BookA',
    splitByAttr: true,
    entryType: 'keyword',
    keywords: '',
    wrapTagName: '',
    placement: { position: 'at_depth_as_system', depth: 2, order: 10000 },
    preventRecursion: true,
    ...overrides,
  };
}

test('computeReplicaAttrRenameTargets builds old/new stable names', () => {
  const targets = computeReplicaAttrRenameTargets('item@id', '断剑', '锈剑', [baseRule()]);
  assert.equal(targets.length, 1);
  assert.equal(targets[0]!.bookName, 'BookA');
  assert.equal(targets[0]!.oldStableName, 'WorkflowHelper-item id-断剑');
  assert.equal(targets[0]!.newStableName, 'WorkflowHelper-item id-锈剑');
});

test('computeReplicaAttrRenameTargets ignores non-splitByAttr', () => {
  const targets = computeReplicaAttrRenameTargets('item@id', 'a', 'b', [
    baseRule({ splitByAttr: false }),
  ]);
  assert.equal(targets.length, 0);
});

test('rewriteAppliedEntryForAttrRename rewrites stableName keys extraKeys', () => {
  const entry: WorldbookWriteAppliedEntry = {
    ruleId: 'r1',
    bookName: 'BookA',
    stableName: 'WorkflowHelper-item id-断剑',
    partial: {
      name: 'WorkflowHelper-item id-断剑',
      content: 'body',
      strategy: { type: 'selective', keys: ['断剑', 'extra'], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
    },
    extraKeys: ['断剑', '自定义'],
  };
  const next = rewriteAppliedEntryForAttrRename(
    entry,
    'WorkflowHelper-item id-断剑',
    'WorkflowHelper-item id-锈剑',
    '断剑',
    '锈剑',
  );
  assert.ok(next);
  assert.equal(next!.stableName, 'WorkflowHelper-item id-锈剑');
  assert.equal(next!.partial.name, 'WorkflowHelper-item id-锈剑');
  assert.deepEqual(next!.partial.strategy?.keys, ['锈剑', 'extra']);
  assert.deepEqual(next!.extraKeys, ['锈剑', '自定义']);
});

test('rewriteAppliedListForAttrRename skips when newStable already present', () => {
  const list: WorldbookWriteAppliedEntry[] = [
    {
      ruleId: 'r1',
      bookName: 'BookA',
      stableName: 'WorkflowHelper-item id-a',
      partial: { name: 'WorkflowHelper-item id-a', content: 'old' },
    },
    {
      ruleId: 'r1',
      bookName: 'BookA',
      stableName: 'WorkflowHelper-item id-b',
      partial: { name: 'WorkflowHelper-item id-b', content: 'keep' },
    },
  ];
  const { next, changed } = rewriteAppliedListForAttrRename(
    list,
    'WorkflowHelper-item id-a',
    'WorkflowHelper-item id-b',
    'a',
    'b',
  );
  assert.equal(changed, 0);
  assert.equal(next[0]!.stableName, 'WorkflowHelper-item id-a');
});

test('rewriteAppliedListForAttrRename migrates matching entry', () => {
  const list: WorldbookWriteAppliedEntry[] = [
    {
      ruleId: 'r1',
      bookName: 'BookA',
      stableName: 'WorkflowHelper-item id-a',
      partial: {
        name: 'WorkflowHelper-item id-a',
        content: 'old',
        strategy: { type: 'selective', keys: ['a'], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
      },
      extraKeys: ['a'],
    },
  ];
  const { next, changed } = rewriteAppliedListForAttrRename(
    list,
    'WorkflowHelper-item id-a',
    'WorkflowHelper-item id-b',
    'a',
    'b',
  );
  assert.equal(changed, 1);
  assert.equal(next[0]!.stableName, 'WorkflowHelper-item id-b');
  assert.deepEqual(next[0]!.partial.strategy?.keys, ['b']);
  assert.deepEqual(next[0]!.extraKeys, ['b']);
});

test('rewriteSnapshotListForAttrRename renames entryName', () => {
  const { next, changed } = rewriteSnapshotListForAttrRename(
    [
      {
        bookName: 'BookA',
        entryName: 'WorkflowHelper-item id-old',
        uid: 1,
        content: 'c',
        enabled: true,
        existed: true,
      },
    ],
    'WorkflowHelper-item id-old',
    'WorkflowHelper-item id-new',
  );
  assert.equal(changed, 1);
  assert.equal(next[0]!.entryName, 'WorkflowHelper-item id-new');
});

if (process.exitCode) process.exit(process.exitCode);
