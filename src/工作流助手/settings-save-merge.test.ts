import assert from 'node:assert/strict';
import { test } from 'node:test';
import lodash from 'lodash';
import { mergePersistedScriptSettings } from './settings-save-merge';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

test('mergePersistedScriptSettings replaces cleanup counts instead of keeping old keys', () => {
  const current = {
    enabled: true,
    replicaFamilyCleanup: {
      enabled: true,
      cycleRounds: 10,
      cycleRunCounts: { a: 1, b: 2 },
      cycleOpportunityCounts: { a: 1 },
      roundsSinceCleanup: 4,
    },
  };
  const persisted = {
    enabled: true,
    replicaFamilyCleanup: {
      enabled: true,
      cycleRounds: 10,
      cycleRunCounts: {},
      cycleOpportunityCounts: {},
      cycleScheduleWaitCounts: {},
      roundsSinceCleanup: 0,
      lastCleanupRound: 0,
      lastManualKeepBySpec: {},
    },
  };
  const next = mergePersistedScriptSettings(current, persisted);
  assert.deepEqual(next.replicaFamilyCleanup.cycleRunCounts, {});
  assert.equal(next.replicaFamilyCleanup.roundsSinceCleanup, 0);
  assert.equal(next.enabled, true);
});
