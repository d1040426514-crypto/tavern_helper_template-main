import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectStageVariableUpdateSources,
  flattenInjectBaseline,
  hasUpdateVariableTag,
  mergeMvuReplacePayload,
  restoreForeignFloorVariables,
  snapshotForeignFloorVariables,
} from './inject-variable-update-logic';

const workflowKeys = {
  post_process_tags: { npc: {} },
  _post_process_done: true,
  _post_process_inject_block: 'block',
  _post_process_body_replace_origin: 'origin',
  _post_process_worldbook_write_applied: { entries: [] },
  _post_process_worldbook_write_snapshots: { entries: [] },
  _post_process_replica_state: { roots: {} },
  _post_process_inject_var_baseline: { stat_data: { hp: 0 } },
  _post_process_pre_workflow_baseline: { post_process_tags: null },
};

test('snapshotForeignFloorVariables drops workflow keys and keeps the rest', () => {
  const next = snapshotForeignFloorVariables({
    stat_data: { hp: 1 },
    schema: { type: 'object' },
    addon_data: { 世界: {} },
    addon_archive: { snapshots: [] },
    ...workflowKeys,
  });
  assert.deepEqual(Object.keys(next ?? {}).sort(), ['addon_archive', 'addon_data', 'schema', 'stat_data']);
  assert.deepEqual(next?.stat_data, { hp: 1 });
  assert.deepEqual(next?.addon_archive, { snapshots: [] });
});

test('snapshotForeignFloorVariables returns undefined for an empty bag', () => {
  assert.equal(snapshotForeignFloorVariables({}), undefined);
  assert.equal(snapshotForeignFloorVariables(workflowKeys), undefined);
});

test('flattenInjectBaseline folds a legacy mvu and addon split into one bag', () => {
  const next = flattenInjectBaseline({
    mvu: {
      stat_data: { hp: 1 },
      schema: { type: 'object' },
      addon_data: { 世界: { stale: true } },
      addon_archive: { snapshots: [{ id: 1 }] },
      post_process_tags: { npc: {} },
      _post_process_inject_var_baseline: {},
      _post_process_pre_workflow_baseline: {},
    },
    addon: { 世界: { n: 2 } },
  });
  assert.deepEqual(next, {
    stat_data: { hp: 1 },
    schema: { type: 'object' },
    addon_data: { 世界: { n: 2 } },
    addon_archive: { snapshots: [{ id: 1 }] },
  });
});

test('flattenInjectBaseline keeps a bag that is already flat', () => {
  const next = flattenInjectBaseline({
    stat_data: { hp: 1 },
    addon_data: { 世界: {} },
    post_process_tags: { npc: {} },
  });
  assert.deepEqual(next, {
    stat_data: { hp: 1 },
    addon_data: { 世界: {} },
  });
});

test('flattenInjectBaseline returns undefined when the legacy split has nothing left', () => {
  assert.equal(flattenInjectBaseline({ mvu: { post_process_tags: {} }, addon: null }), undefined);
  assert.equal(flattenInjectBaseline({}), undefined);
});

test('mergeMvuReplacePayload keeps floor keys the patch result omitted', () => {
  const next = mergeMvuReplacePayload(
    {
      stat_data: { hp: 1 },
      addon_data: { 世界: {} },
      addon_archive: { snapshots: [{ id: 1 }] },
      post_process_tags: { npc: { live: true } },
      other_script: { n: 1 },
    },
    {
      stat_data: { hp: 2 },
      post_process_tags: { npc: { stale: true } },
    },
  );
  assert.deepEqual(next.stat_data, { hp: 2 });
  assert.deepEqual(next.addon_data, { 世界: {} });
  assert.deepEqual(next.addon_archive, { snapshots: [{ id: 1 }] });
  assert.deepEqual(next.other_script, { n: 1 });
  assert.deepEqual(next.post_process_tags, { npc: { live: true } });
});

test('restoreForeignFloorVariables replaces non-workflow keys and leaves workflow keys', () => {
  const next = restoreForeignFloorVariables(
    {
      stat_data: { hp: 9 },
      extra_script: { n: 1 },
      post_process_tags: { npc: { live: true } },
      _post_process_replica_state: { roots: { a: [] } },
    },
    {
      stat_data: { hp: 1 },
      addon_data: { 世界: {} },
      addon_archive: { snapshots: [] },
      post_process_tags: { npc: { stale: true } },
    },
  );
  assert.deepEqual(next, {
    post_process_tags: { npc: { live: true } },
    _post_process_replica_state: { roots: { a: [] } },
    stat_data: { hp: 1 },
    addon_data: { 世界: {} },
    addon_archive: { snapshots: [] },
  });
});

test('hasUpdateVariableTag detects tag case-insensitively', () => {
  assert.equal(hasUpdateVariableTag('<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>'), true);
  assert.equal(hasUpdateVariableTag('<updatevariable>x</updatevariable>'), true);
  assert.equal(hasUpdateVariableTag('<JSONPatch>[]</JSONPatch>'), false);
  assert.equal(hasUpdateVariableTag(''), false);
});

test('collectStageVariableUpdateSources keeps success order and skips failures', () => {
  const sources = collectStageVariableUpdateSources([
    {
      success: true,
      variableUpdateSource: '<UpdateVariable><JSONPatch>[{"op":"replace"}]</JSONPatch></UpdateVariable>',
    },
    {
      success: false,
      variableUpdateSource: '<UpdateVariable>fail</UpdateVariable>',
    },
    {
      success: true,
      skipped: true,
      variableUpdateSource: '<UpdateVariable>skipped</UpdateVariable>',
    },
    {
      success: true,
      variableUpdateSource: 'no variable tag here',
    },
    {
      success: true,
      variableUpdateSource:
        'prefix\n<UpdateVariable><AddonJSONPatch>[]</AddonJSONPatch></UpdateVariable>\nsuffix',
    },
  ]);

  assert.equal(sources.length, 2);
  assert.match(sources[0]!, /JSONPatch/);
  assert.match(sources[1]!, /AddonJSONPatch/);
});

test('collectStageVariableUpdateSources ignores empty source even if success', () => {
  assert.deepEqual(
    collectStageVariableUpdateSources([
      { success: true, variableUpdateSource: '' },
      { success: true, variableUpdateSource: '   ' },
      { success: true },
    ]),
    [],
  );
});
