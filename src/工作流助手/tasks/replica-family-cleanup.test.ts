import assert from 'node:assert/strict';
import type { PostProcessTask, ScriptSettings } from './schema';
import {
  applyReplicaFamilyCleanup,
  computeAutoKeepSet,
  computeManualDialogDefaultSelection,
  createDefaultReplicaFamilyCleanup,
  ensureReplicaFamilyCleanupDefaults,
  incrementReplicaRunCounts,
  listReplicaFamilyCleanupCandidates,
  pruneFloorTagKeysForReplica,
  shouldTriggerCleanup,
  tickCleanupRound,
} from './replica-family-cleanup';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

function baseSettings(overrides: Partial<ScriptSettings> = {}): ScriptSettings {
  const root: PostProcessTask = {
    id: 'root',
    name: 'root',
    enabled: true,
    stage: 2,
    syncAsReplicaFamily: true,
    replicaFamilySpec: 'item@id',
    replicaFamilyScheduleMode: 'manual',
    promptGroups: [],
    extractInjectTags: [],
    mergeStrategy: 'concat',
    maxRetries: 3,
    minLength: 0,
    apiPresetName: '',
    plotWorldbookMode: 'inherit',
    contextMode: 'inherit',
    structuredOutputMode: 'off',
  };
  const rep1: PostProcessTask = {
    id: 'rep-1',
    name: 'rep 1',
    enabled: true,
    stage: 2,
    replicaFamilyRootId: 'root',
    replicaFamilyAttrValue: '1',
    replicaFamilyLaunched: true,
    promptGroups: [],
    extractInjectTags: [],
    mergeStrategy: 'concat',
    maxRetries: 3,
    minLength: 0,
    apiPresetName: '',
    plotWorldbookMode: 'inherit',
    contextMode: 'inherit',
    structuredOutputMode: 'off',
  };
  const rep2: PostProcessTask = {
    ...rep1,
    id: 'rep-2',
    name: 'rep 2',
    replicaFamilyAttrValue: '2',
    replicaFamilyLaunched: false,
  };
  return {
    enabled: true,
    tasks: [root, rep1, rep2],
    replicaFamilyCleanup: {
      enabled: true,
      cycleRounds: 4,
      activityRatio: 0.5,
      mode: 'auto',
      roundsSinceCleanup: 0,
      cycleRunCounts: { 'rep-1': 2, 'rep-2': 1 },
      lastManualKeepByRoot: {},
      lastCleanupRound: 0,
    },
    ...overrides,
  } as ScriptSettings;
}

test('computeAutoKeepSet keeps launched manual and active replicas', () => {
  const settings = baseSettings();
  const keep = computeAutoKeepSet(settings);
  assert.deepEqual(keep.root, ['1']);
});

test('computeAutoKeepSet ignores lastManualKeepByRoot when not launched or active', () => {
  const settings = baseSettings({
    replicaFamilyCleanup: {
      ...baseSettings().replicaFamilyCleanup!,
      lastManualKeepByRoot: { root: ['2'] },
    },
  });
  const keep = computeAutoKeepSet(settings);
  assert.deepEqual(keep.root, ['1']);
});

test('computeManualDialogDefaultSelection includes last manual keep', () => {
  const settings = baseSettings({
    replicaFamilyCleanup: {
      ...baseSettings().replicaFamilyCleanup!,
      lastManualKeepByRoot: { root: ['2'] },
    },
  });
  const keep = computeManualDialogDefaultSelection(settings);
  assert.deepEqual(keep.root.sort(), ['1', '2']);
});

test('listReplicaFamilyCleanupCandidates marks last manual keep as defaultSelected', () => {
  const settings = baseSettings({
    replicaFamilyCleanup: {
      ...baseSettings().replicaFamilyCleanup!,
      lastManualKeepByRoot: { root: ['2'] },
    },
  });
  const groups = listReplicaFamilyCleanupCandidates(settings);
  const rep2 = groups[0]!.members.find(m => m.attrValue === '2');
  assert.equal(rep2?.defaultSelected, true);
});

test('tickCleanupRound and shouldTriggerCleanup', () => {
  const settings = baseSettings();
  for (let i = 0; i < 3; i++) tickCleanupRound(settings);
  assert.equal(shouldTriggerCleanup(settings), false);
  tickCleanupRound(settings);
  assert.equal(shouldTriggerCleanup(settings), true);
});

test('applyReplicaFamilyCleanup removes unkept replica tasks', () => {
  const g = globalThis as Record<string, unknown>;
  g.updateVariablesWith = (fn: (v: Record<string, unknown>) => Record<string, unknown>) => fn({});
  const settings = baseSettings();
  const next = applyReplicaFamilyCleanup(settings, { root: ['1'] }, 0);
  assert.equal(next.tasks.filter(t => t.replicaFamilyRootId === 'root').length, 1);
  assert.equal(next.tasks.find(t => t.replicaFamilyAttrValue === '2'), undefined);
  assert.equal(next.replicaFamilyCleanup.roundsSinceCleanup, 0);
});

test('applyReplicaFamilyCleanup without persist leaves lastManualKeepByRoot unchanged', () => {
  const g = globalThis as Record<string, unknown>;
  g.updateVariablesWith = (fn: (v: Record<string, unknown>) => Record<string, unknown>) => fn({});
  const settings = baseSettings({
    replicaFamilyCleanup: {
      ...baseSettings().replicaFamilyCleanup!,
      lastManualKeepByRoot: { root: ['9'] },
    },
  });
  applyReplicaFamilyCleanup(settings, { root: ['1'] }, 0);
  assert.deepEqual(settings.replicaFamilyCleanup!.lastManualKeepByRoot, { root: ['9'] });
});

test('applyReplicaFamilyCleanup with persist writes only user selection', () => {
  const g = globalThis as Record<string, unknown>;
  g.updateVariablesWith = (fn: (v: Record<string, unknown>) => Record<string, unknown>) => fn({});
  const settings = baseSettings({
    replicaFamilyCleanup: {
      ...baseSettings().replicaFamilyCleanup!,
      lastManualKeepByRoot: { root: ['9'] },
    },
  });
  applyReplicaFamilyCleanup(settings, { root: ['1'] }, 0, {
    persistManualKeepByRoot: { root: ['1'] },
  });
  assert.deepEqual(settings.replicaFamilyCleanup!.lastManualKeepByRoot, { root: ['1'] });
});

test('pruneFloorTagKeysForReplica removes nested and flat keys for unkept attrs', () => {
  const g = globalThis as Record<string, unknown>;
  let vars: Record<string, unknown> = {
    post_process_tags: {
      item_id: { '1': 'keep-me', '2': 'drop-me' },
      'item@id=1': 'flat-keep',
      'item@id=2': 'flat-drop',
    },
  };
  g.updateVariablesWith = (
    fn: (v: Record<string, unknown>) => Record<string, unknown>,
    _opts: unknown,
  ) => {
    vars = fn(vars);
    return vars;
  };
  pruneFloorTagKeysForReplica('item@id', ['2'], 0);
  const tags = vars.post_process_tags as Record<string, unknown>;
  assert.deepEqual(tags.item_id, { '1': 'keep-me' });
  assert.equal(tags['item@id=1'], 'flat-keep');
  assert.equal(tags['item@id=2'], undefined);
});

test('incrementReplicaRunCounts accumulates per member', () => {
  const settings = baseSettings();
  incrementReplicaRunCounts(settings, ['rep-1', 'rep-1']);
  assert.equal(settings.replicaFamilyCleanup!.cycleRunCounts['rep-1'], 4);
});

test('createDefaultReplicaFamilyCleanup enables auto mode when replica family exists', () => {
  const defaults = createDefaultReplicaFamilyCleanup(true);
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.mode, 'auto');
});

test('createDefaultReplicaFamilyCleanup stays disabled when no replica family', () => {
  const defaults = createDefaultReplicaFamilyCleanup(false);
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.mode, 'manual');
});

test('ensureReplicaFamilyCleanupDefaults upgrades untouched factory defaults', () => {
  const settings = baseSettings({
    replicaFamilyCleanup: createDefaultReplicaFamilyCleanup(false),
  });
  ensureReplicaFamilyCleanupDefaults(settings);
  assert.equal(settings.replicaFamilyCleanup!.enabled, true);
  assert.equal(settings.replicaFamilyCleanup!.mode, 'auto');
});

if (process.exitCode) process.exit(process.exitCode);
