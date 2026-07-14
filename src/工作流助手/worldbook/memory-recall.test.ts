import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractAmCodeFromEntry,
  extractAmCodeNumber,
  selectRecentChronicleMemoryEntries,
  wrapMemoryRecallContent,
} from './memory-recall';

test('extractAmCodeNumber parses AMXXXX', () => {
  assert.equal(extractAmCodeNumber('AM0007'), 7);
  assert.equal(extractAmCodeNumber('key AM0012 extra'), 12);
  assert.equal(extractAmCodeNumber('no-code'), null);
});

test('extractAmCodeFromEntry prefers strategy keys', () => {
  assert.equal(
    extractAmCodeFromEntry({
      name: '总结条目1',
      strategy: { type: 'selective', keys: ['AM0003'], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
    } as never),
    3,
  );
});

test('selectRecentChronicleMemoryEntries takes highest AM then sorts ascending', () => {
  const selected = selectRecentChronicleMemoryEntries(
    [
      { entry: { uid: 1 } as never, bookName: 'A', am: 1 },
      { entry: { uid: 2 } as never, bookName: 'A', am: 5 },
      { entry: { uid: 3 } as never, bookName: 'A', am: 3 },
      { entry: { uid: 4 } as never, bookName: 'A', am: 9 },
    ],
    2,
  );
  assert.deepEqual(
    selected.map(s => s.am),
    [5, 9],
  );
  assert.deepEqual(selectRecentChronicleMemoryEntries(selected, 0), []);
});

test('wrapMemoryRecallContent wraps or empties', () => {
  assert.match(wrapMemoryRecallContent('body'), /<记忆回溯>/);
  assert.equal(wrapMemoryRecallContent('  '), '');
});
