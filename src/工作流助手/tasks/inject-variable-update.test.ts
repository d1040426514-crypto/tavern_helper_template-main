import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectStageVariableUpdateSources,
  hasUpdateVariableTag,
  omitMvuBaselineExtras,
} from './inject-variable-update-logic';

test('omitMvuBaselineExtras drops addon and workflow baseline keys', () => {
  const next = omitMvuBaselineExtras({
    stat_data: { hp: 1 },
    schema: { type: 'object' },
    addon_data: { 世界: {} },
    addon_archive: { snapshots: [] },
    _post_process_inject_var_baseline: { mvu: {} },
    _post_process_pre_workflow_baseline: { post_process_tags: null },
  });
  assert.deepEqual(Object.keys(next).sort(), ['schema', 'stat_data']);
  assert.deepEqual(next.stat_data, { hp: 1 });
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
