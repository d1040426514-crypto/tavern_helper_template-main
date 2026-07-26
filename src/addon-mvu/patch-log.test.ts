import assert from 'node:assert/strict';
import lodash from 'lodash';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

import { parseJsonPatchOpsWithIssues } from './patch-parse-lenient';
import {
  clearPatchLog,
  createPatchLogEntry,
  getLastPatchLog,
  mergePatchLogAfterManualApply,
  setLastPatchLog,
} from './patch-log';
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
    assert.equal(ops.length, 2);
    assert.equal(failedFragments.length, 0);
    assert.ok(issues.some(i => i.kind === 'heal'));
    console.log('ok parse heals missing braces (no failedFragments)');
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
  { "op": "insert", "path": "/a", "value": { "x": "未闭合
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

  {
    clearPatchLog();
    setLastPatchLog(
      createPatchLogEntry({
        messageId: 1,
        changed: true,
        ops: [
          { op: 'replace', path: '/阿斯塔利亚/刊报日期', value: '旧日期' },
          { op: 'replace', path: '/阿斯塔利亚/时代快讯/世界时代阶段/时代阶段', value: '中期' },
        ],
        issues: [{ kind: 'parse', message: '第 1 条 op 无法修复: bad' }],
        failedFragments: [
          {
            index: 1,
            snippet: '{ "op": "insert", "path": "/阿斯塔利亚/坏条目", "value": {',
            message: '第 1 条 op 无法修复: bad',
          },
        ],
      }),
    );

    const mergedOnly = mergePatchLogAfterManualApply(getLastPatchLog(), {
      ops: [{ op: 'insert', path: '/阿斯塔利亚/坏条目', value: { ok: true } }],
      issues: [],
      changed: true,
      resolvedFragmentIndexes: [1],
    });
    assert.equal(mergedOnly.ops.length, 3);
    assert.ok(mergedOnly.ops.some(o => 'path' in o && o.path === '/阿斯塔利亚/刊报日期'));
    assert.ok(mergedOnly.ops.some(o => 'path' in o && o.path === '/阿斯塔利亚/时代快讯/世界时代阶段/时代阶段'));
    assert.ok(mergedOnly.ops.some(o => 'path' in o && o.path === '/阿斯塔利亚/坏条目'));
    assert.equal(mergedOnly.failedFragments.length, 0);
    assert.ok(!mergedOnly.issues.some(i => i.message.includes('第 1 条')));
    assert.equal(mergedOnly.manualFixedOps.length, 1);
    assert.ok(
      mergedOnly.manualFixedOps.some(o => 'path' in o && o.path === '/阿斯塔利亚/坏条目'),
    );
    console.log('ok mergePatchLogAfterManualApply keeps other ops');
  }

  {
    clearPatchLog();
    setLastPatchLog(
      createPatchLogEntry({
        messageId: 1,
        changed: false,
        ops: [],
        issues: [{ kind: 'parse', message: '第 2 条 op 无法修复: bad' }],
        failedFragments: [
          {
            index: 2,
            snippet: '{ "op": "replace", "path": "/阿斯塔利亚/刊报日期", "value":',
            message: '第 2 条 op 无法修复: bad',
          },
        ],
      }),
    );
    const failedMerge = mergePatchLogAfterManualApply(getLastPatchLog(), {
      ops: [{ op: 'replace', path: '/阿斯塔利亚/刊报日期', value: 'x' }],
      issues: [
        {
          kind: 'apply',
          message: 'apply failed',
          op: { op: 'replace', path: '/阿斯塔利亚/刊报日期', value: 'x' },
        },
      ],
      changed: false,
    });
    assert.equal(failedMerge.manualFixedOps.length, 0);
    console.log('ok merge does not write manualFixedOps on apply failure');
  }

  {
    clearPatchLog();
    setLastPatchLog(
      createPatchLogEntry({
        messageId: 2,
        changed: true,
        ops: [
          { op: 'replace', path: '/阿斯塔利亚/刊报日期', value: 'A' },
          { op: 'replace', path: '/阿斯塔利亚/时代快讯/世界时代阶段/时代阶段', value: 'B' },
        ],
        issues: [],
        failedFragments: [
          {
            index: 9,
            snippet: '{ "op": "replace", "path": "/阿斯塔利亚/刊报日期", "value":',
            message: 'frag9',
          },
        ],
      }),
    );
    const base = baseWorld();
    await applyOpsToFloor([{ op: 'replace', path: '/阿斯塔利亚/刊报日期', value: 'C' }], base, {
      emitEvents: false,
      mergeIntoLastLog: true,
      resolvedFragmentIndexes: [9],
      message_id: undefined,
    });
    const log = getLastPatchLog();
    assert.ok(log);
    assert.equal(log!.ops.length, 2);
    assert.ok(log!.ops.some(o => 'path' in o && o.path?.includes('时代阶段')));
    assert.equal(
      (log!.ops.find(o => 'path' in o && o.path === '/阿斯塔利亚/刊报日期') as { value: string }).value,
      'C',
    );
    assert.equal(log!.failedFragments.length, 0);
    assert.equal(log!.manualFixedOps.length, 1);
    assert.ok(log!.manualFixedOps.some(o => 'path' in o && o.path === '/阿斯塔利亚/刊报日期'));
    console.log('ok applyOpsToFloor mergeIntoLastLog preserves siblings');
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
