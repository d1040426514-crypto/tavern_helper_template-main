import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  diffExtraKeys,
  mergeEntryKeys,
  normalizeKeywordList,
  resolveAppliedExtraKeys,
} from './entry-keys';
import type { WorldbookWriteAppliedEntry } from './write-sync';

test('normalizeKeywordList splits comma and fullwidth comma', () => {
  assert.deepEqual(normalizeKeywordList('a, b，c'), ['a', 'b', 'c']);
  assert.deepEqual(normalizeKeywordList([' x ', '', 'y']), ['x', 'y']);
  assert.deepEqual(normalizeKeywordList(null), []);
});

test('mergeEntryKeys keeps order and dedupes', () => {
  assert.deepEqual(mergeEntryKeys(['圣剑', 'foo'], ['foo', 'bar']), ['圣剑', 'foo', 'bar']);
  assert.deepEqual(mergeEntryKeys(['圣剑'], []), ['圣剑']);
});

test('diffExtraKeys strips defaults', () => {
  assert.deepEqual(diffExtraKeys(['圣剑', 'foo', 'bar'], ['圣剑']), ['foo', 'bar']);
  assert.deepEqual(diffExtraKeys(['圣剑'], ['圣剑']), []);
});

test('resolveAppliedExtraKeys prefers explicit extraKeys', () => {
  const applied: WorldbookWriteAppliedEntry = {
    ruleId: 'r1',
    bookName: 'BookA',
    stableName: 'WorkflowHelper-item name-圣剑',
    partial: {
      strategy: {
        type: 'selective',
        keys: ['圣剑', 'old'],
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global',
      },
    },
    extraKeys: ['alias'],
  };
  assert.deepEqual(resolveAppliedExtraKeys(applied), ['alias']);
});

test('resolveAppliedExtraKeys returns empty when extraKeys missing (no strategy.keys backfill)', () => {
  const applied: WorldbookWriteAppliedEntry = {
    ruleId: 'r1',
    bookName: 'BookA',
    stableName: 'WorkflowHelper-item name-圣剑',
    partial: {
      strategy: {
        type: 'selective',
        keys: ['圣剑', 'foo'],
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global',
      },
    },
  };
  assert.deepEqual(resolveAppliedExtraKeys(applied), []);
});

test('resolveAppliedExtraKeys empty array does not smuggle strategy.keys', () => {
  const applied: WorldbookWriteAppliedEntry = {
    ruleId: 'r1',
    bookName: 'BookA',
    stableName: 'x',
    partial: {
      strategy: {
        type: 'selective',
        keys: ['圣剑', 'stale'],
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global',
      },
    },
    extraKeys: [],
  };
  assert.deepEqual(resolveAppliedExtraKeys(applied), []);
});

test('resolveAppliedExtraKeys returns empty when unset', () => {
  assert.deepEqual(resolveAppliedExtraKeys(undefined), []);
  assert.deepEqual(
    resolveAppliedExtraKeys({
      ruleId: 'r1',
      bookName: 'BookA',
      stableName: 'x',
      partial: {},
      extraKeys: [],
    }),
    [],
  );
});

console.log('entry-keys.test.ts: all passed');
