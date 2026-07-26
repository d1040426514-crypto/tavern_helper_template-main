import assert from 'node:assert/strict';
import lodash from 'lodash';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

import {
  applyMvuLikePatch,
  extractAddonJsonPatchOpsWithIssues,
  parseJsonPatchOpsWithIssues,
} from './patch';
import { normalizeAddonData, type AddonData } from './schema';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

function baseWorld(): AddonData {
  return normalizeAddonData({
    阿斯塔利亚: {
      降临: true,
      平行演化: false,
      刊报日期: '旧',
    },
  });
}

test('parseJsonPatchOpsWithIssues: valid array unchanged', () => {
  const { ops, issues } = parseJsonPatchOpsWithIssues(
    `[{"op":"replace","path":"/阿斯塔利亚/刊报日期","value":"新"}]`,
  );
  assert.equal(ops.length, 1);
  assert.equal(issues.length, 0);
  assert.equal((ops[0] as { path: string }).path, '/阿斯塔利亚/刊报日期');
});

test('parseJsonPatchOpsWithIssues: skips broken op keeps good ones', () => {
  const raw = `[
    { "op": "insert", "path": "/阿斯塔利亚/rumor/bad", "value": { "影响力": "圈内谈资", "流变历程": { "1": { "真相": "x" } } },
    { "op": "replace", "path": "/阿斯塔利亚/刊报日期", "value": "d1" }
  ]`;
  const { ops, issues } = parseJsonPatchOpsWithIssues(raw);
  assert.equal(ops.length, 1);
  assert.equal((ops[0] as { op: string; path: string }).op, 'replace');
  assert.ok(issues.some(i => i.kind === 'parse'));
});

test('extractAddonJsonPatchOpsWithIssues: plain XML without UpdateVariable or structured mode', () => {
  const message = `前文
<AddonJSONPatch>
[
  { "op": "insert", "path": "/阿斯塔利亚/x", "value": { "a": 1 },
  { "op": "replace", "path": "/阿斯塔利亚/刊报日期", "value": "d2" }
]
</AddonJSONPatch>
后文`;
  const { ops, issues } = extractAddonJsonPatchOpsWithIssues(message);
  assert.equal(ops.length, 1);
  assert.equal((ops[0] as { path: string }).path, '/阿斯塔利亚/刊报日期');
  assert.ok(issues.some(i => i.kind === 'parse'));

  const { data } = applyMvuLikePatch(_.cloneDeep(baseWorld()) as Record<string, unknown>, ops);
  assert.equal(_.get(data, '阿斯塔利亚.刊报日期'), 'd2');
});

test('all bad ops yields empty and parse issue', () => {
  const raw = `[
    { "op": "insert", "path": "/a", "value": { "x": 1 },
    { "op": "replace", "path": "/b", "value": { "y": 2 }
  ]`;
  const { ops, issues } = parseJsonPatchOpsWithIssues(raw);
  assert.equal(ops.length, 0);
  assert.ok(issues.some(i => i.kind === 'parse'));
});

test('invalid shaped op filtered with parse issue', () => {
  const raw = `[
    { "foo": 1 },
    { "op": "replace", "path": "/阿斯塔利亚/刊报日期", "value": "ok" }
  ]`;
  const { ops, issues } = parseJsonPatchOpsWithIssues(raw);
  assert.equal(ops.length, 1);
  assert.ok(issues.some(i => i.kind === 'parse' && /第 1 条/.test(i.message)));
});
