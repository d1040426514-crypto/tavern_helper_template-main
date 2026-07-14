import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPlotWorldbookEntrySelectable,
  sanitizePlotWorldbookEnabledUids,
  selectablePlotWorldbookEntryUids,
} from './plot-entry-select';

test('selectablePlotWorldbookEntryUids only includes ST-enabled visible entries', () => {
  const uids = selectablePlotWorldbookEntryUids([
    { uid: 1, name: '普通条目', enabled: true } as never,
    { uid: 2, name: '普通条目2', enabled: false } as never,
    { uid: 3, name: 'TavernDB-ACU-foo', enabled: true } as never,
    { uid: 4, name: 'WorkflowHelper-result', enabled: true } as never,
  ]);
  assert.deepEqual(uids, [1]);
});

test('sanitizePlotWorldbookEnabledUids removes disabled uids', () => {
  const entries = [
    { uid: 1, name: 'a', enabled: true } as never,
    { uid: 2, name: 'b', enabled: false } as never,
  ];
  assert.deepEqual(sanitizePlotWorldbookEnabledUids(entries, [1, 2]), [1]);
});

test('sanitizePlotWorldbookEnabledUids removes auto-included WorkflowHelper uids', () => {
  const entries = [
    { uid: 1, name: '普通', enabled: true } as never,
    { uid: 2, name: 'WorkflowHelper-x', enabled: true } as never,
  ];
  assert.deepEqual(sanitizePlotWorldbookEnabledUids(entries, [1, 2]), [1]);
});

test('isPlotWorldbookEntrySelectable respects enabled flag', () => {
  assert.equal(isPlotWorldbookEntrySelectable({ uid: 1, name: 'x', enabled: false } as never), false);
  assert.equal(isPlotWorldbookEntrySelectable({ uid: 2, name: 'x', enabled: true } as never), true);
});

test('isPlotWorldbookEntrySelectable hides WorkflowHelper even when ST-enabled', () => {
  assert.equal(
    isPlotWorldbookEntrySelectable({ uid: 1, name: 'WorkflowHelper-result', enabled: true } as never),
    false,
  );
});
