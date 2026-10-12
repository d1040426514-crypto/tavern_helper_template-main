import assert from 'node:assert/strict';
import { test } from 'node:test';
import lodash from 'lodash';
import { withPreWorkflowBaselineKey } from './pre-workflow-baseline';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

test('withPreWorkflowBaselineKey puts the held baseline back without clearing live tags', () => {
  const data = {
    post_process_tags: { npc_act: { 阿露卡: '现在' } },
    _post_process_worldbook_write_applied: [{ stableName: 'WorkflowHelper-npc act-阿露卡', removed: false }],
  };
  const held = {
    post_process_tags: null,
    worldbookApplied: null,
    replicaSnapshot: null,
  };
  const next = withPreWorkflowBaselineKey(data, held);
  assert.deepEqual(next.post_process_tags, { npc_act: { 阿露卡: '现在' } });
  assert.equal(next._post_process_worldbook_write_applied.length, 1);
  assert.deepEqual(next._post_process_pre_workflow_baseline, held);
});
