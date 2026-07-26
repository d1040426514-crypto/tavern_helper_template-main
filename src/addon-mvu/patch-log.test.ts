import assert from 'node:assert/strict';
import lodash from 'lodash';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

import { parseJsonPatchOpsWithIssues } from './patch-parse-lenient';
import { clearPatchLog, createPatchLogEntry, getLastPatchLog, setLastPatchLog } from './patch-log';
import { applyOpsToFloor, updateAddonFromMessage } from './update';
import { normalizeAddonData, type AddonData } from './schema';

(globalThis as any).getChatMessages = () => [{ message: '' }];
(globalThis as any).toastr = { warning: () => {}, error: () => {}, info: () => {} };
(globalThis as any).eventEmit = async () => {};
(globalThis as any).getVariables = () => ({});
(globalThis as any).getScriptId = () => 'test';
(globalThis as any).getScriptTrees = () => [];

function baseWorld(): AddonData {
  return normalizeAddonData({
    阿斯塔利亚: {
      降临: true,
      平行演化: false,
      刊报日期: '旧',
    },
  });
}

async function main() {
  {
    clearPatchLog();
    const raw = `[
    { "op": "insert", "path": "/阿斯塔利亚/x", "value": { "a": 1 },
    { "op": "replace", "path": "/阿斯塔利亚/刊报日期", "value": "d2" }
  ]`;
    const { ops, issues, failedFragments } = parseJsonPatchOpsWithIssues(raw);
    assert.equal(ops.length, 1);
    assert.ok(failedFragments.length >= 1);
    assert.ok(issues.some(i => i.kind === 'parse'));
    console.log('ok parse failedFragments for broken op');
  }

  {
    clearPatchLog();
    assert.equal(getLastPatchLog(), null);
    const entry = createPatchLogEntry({
      ops: [{ op: 'replace', path: '/阿斯塔利亚/刊报日期', value: 'x' }],
      issues: [],
      failedFragments: [],
      changed: true,
      messageId: 3,
    });
    setLastPatchLog(entry);
    assert.equal(getLastPatchLog()?.messageId, 3);
    clearPatchLog();
    assert.equal(getLastPatchLog(), null);
    console.log('ok store set/get/clear patch log');
  }

  {
    clearPatchLog();
    const message = `<AddonJSONPatch>
[
  { "op": "insert", "path": "/a", "value": { "x": 1 },
  { "op": "replace", "path": "/b", "value": { "y": 2 }
]
</AddonJSONPatch>`;
    const result = await updateAddonFromMessage(message, baseWorld(), { emitEvents: false });
    assert.equal(result, undefined);
    const log = getLastPatchLog();
    assert.ok(log);
    assert.equal(log!.ops.length, 0);
    assert.ok(log!.issues.some(i => i.kind === 'parse'));
    assert.ok(log!.failedFragments.length >= 1);
    console.log('ok updateAddonFromMessage records log when all ops bad');
  }

  {
    clearPatchLog();
    const base = baseWorld();
    const result = await applyOpsToFloor(
      [{ op: 'replace', path: '/阿斯塔利亚/刊报日期', value: '手工' }],
      base,
      { emitEvents: false },
    );
    assert.equal(result.changed, true);
    assert.equal(_.get(result.data, '阿斯塔利亚.刊报日期'), '手工');
    assert.equal(getLastPatchLog()?.ops.length, 1);
    console.log('ok applyOpsToFloor writes field and log');
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
