import assert from 'node:assert/strict';
import { test } from 'node:test';
import lodash from 'lodash';
import {
  remapManualExpandedKeys,
  reorderPromptGroupsAt,
} from './prompt-group-ops';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

const sample = [
  { name: 'a', role: 'user' as const, content: 'a', enabled: true },
  { name: 'b', role: 'user' as const, content: 'b', enabled: true },
  { name: 'c', role: 'user' as const, content: 'c', enabled: true },
];

test('reorderPromptGroupsAt moves item to target index', () => {
  const moved = reorderPromptGroupsAt(sample, 0, 2);
  assert.deepEqual(
    moved.map(g => g.name),
    ['b', 'c', 'a'],
  );
});

test('reorderPromptGroupsAt no-op when indices equal', () => {
  const same = reorderPromptGroupsAt(sample, 1, 1);
  assert.equal(same, sample);
});

test('reorderPromptGroupsAt throws on invalid index', () => {
  assert.throws(() => reorderPromptGroupsAt(sample, -1, 0));
  assert.throws(() => reorderPromptGroupsAt(sample, 0, 3));
});

test('remapManualExpandedKeys follows moved segment and shifts neighbors', () => {
  const keys = new Set(['m-0', 'm-2', 'a-x']);
  assert.deepEqual(
    [...remapManualExpandedKeys(keys, 0, 2)].sort(),
    ['a-x', 'm-1', 'm-2'].sort(),
  );
  assert.deepEqual(
    [...remapManualExpandedKeys(new Set(['m-2']), 2, 0)].sort(),
    ['m-0'],
  );
});
