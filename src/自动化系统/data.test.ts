import assert from 'node:assert/strict';
import {
  extractPreviewFromRunStatus,
  flattenNpcActTags,
  floorHasOwnReplicaSnapshot,
  namesFromFloorSnapshot,
  parseLaunchedNameList,
  pickRosterNames,
  PREVIEW_TAG,
} from './data';
import { buildChronicle, parseInteractions } from './parse';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('flattenNpcActTags nested and flat keys', () => {
  const flat = flattenNpcActTags({
    npc_act: { 李明: '行为链: A→B', 王芳: '资金状况: 略有盈余' },
    'npc@act=赵铁': '长期目标: 求学',
  });
  assert.equal(flat['李明'], '行为链: A→B');
  assert.equal(flat['王芳'], '资金状况: 略有盈余');
  assert.equal(flat['赵铁'], '长期目标: 求学');
});

test('parseLaunchedNameList splits dunhao lists', () => {
  assert.deepEqual(parseLaunchedNameList('李明、王芳、赵铁'), ['李明', '王芳', '赵铁']);
  assert.deepEqual(parseLaunchedNameList(''), []);
});

test('extractPreviewFromRunStatus skips failed and skipped tasks', () => {
  const raw = extractPreviewFromRunStatus({
    messageId: 3,
    taskResults: [
      {
        skipped: true,
        extractedTags: { [PREVIEW_TAG]: '<交互 编号="X">简述: skip</交互>' },
      },
      {
        success: false,
        extractedTags: { [PREVIEW_TAG]: '<交互 编号="Y">简述: fail</交互>' },
      },
      {
        success: true,
        extractedTags: {
          [PREVIEW_TAG]: `<交互 编号="E01" 角色="李明,王芳">
简述: 街头偶遇
结果: 交换情报
</交互>`,
        },
      },
    ],
  });
  assert.match(raw, /街头偶遇/);
  assert.equal(extractPreviewFromRunStatus(null), '');
  assert.equal(extractPreviewFromRunStatus({ taskResults: [] }), '');
});

test('end-to-end front/back lists + interactions + npc map', () => {
  const interactions = parseInteractions(`
    <交互 编号="E01" 角色="李明,王芳">
简述: 街头偶遇
结果: 交换情报
    </交互>
  `);
  const all = flattenNpcActTags({
    npc_act: {
      李明: '行为链: 巡街→查账\n资金状况: 手头宽裕',
      无关人: '行为链: X',
    },
  });
  const data = buildChronicle(
    {
      frontNames: ['李明'],
      backNames: ['王芳', '周监'],
      interactions,
    },
    all,
  );
  assert.equal(data.sections[0]?.key, 'front');
  assert.equal(data.sections[0]?.npcs[0]?.name, '李明');
  assert.equal(data.sections[0]?.npcs[0]?.wealth, '手头宽裕');
  assert.equal(data.sections[1]?.npcs[0]?.name, '王芳');
  assert.equal(data.sections[1]?.npcs[0]?.empty, true);
  assert.equal(data.sections[1]?.npcs[1]?.name, '周监');
  assert.equal(data.sections[1]?.npcs[1]?.empty, true);
  assert.equal(data.interactions.length, 1);
  assert.equal(data.interactions[0]?.summary, '街头偶遇');
});

test('this-floor snapshot roster wins over preview names', () => {
  const snapshot = {
    'root-front': {
      lastEnumAttrValues: ['泽尼娅', '朱蒂卡'],
      launchedAttrValues: ['旧名'],
    },
  };
  assert.equal(floorHasOwnReplicaSnapshot(snapshot), true);
  const floor = namesFromFloorSnapshot(
    { id: 'root-front', replicaFamilyScheduleMode: 'auto' },
    snapshot,
  );
  assert.deepEqual(pickRosterNames(floor, ['宏里的别人']), ['泽尼娅', '朱蒂卡']);
});

test('manual schedule prefers launchedAttrValues on this floor', () => {
  const floor = namesFromFloorSnapshot(
    { id: 'root-back', replicaFamilyScheduleMode: 'manual' },
    { 'root-back': { lastEnumAttrValues: ['枚举'], launchedAttrValues: ['手动'] } },
  );
  assert.deepEqual(pickRosterNames(floor, ['预览']), ['手动']);
});

test('missing floor snapshot allows preview names', () => {
  assert.equal(floorHasOwnReplicaSnapshot({}), false);
  assert.equal(floorHasOwnReplicaSnapshot(null), false);
  const floor = namesFromFloorSnapshot(
    { id: 'root-front', replicaFamilyScheduleMode: 'auto' },
    {},
  );
  assert.equal(floor, null);
  assert.deepEqual(pickRosterNames(floor, ['朱蒂卡']), ['朱蒂卡']);
});

test('empty roster already on this floor does not fall back to preview', () => {
  const floor = namesFromFloorSnapshot(
    { id: 'root-front', replicaFamilyScheduleMode: 'auto' },
    { 'root-front': { lastEnumAttrValues: [], launchedAttrValues: [] } },
  );
  assert.deepEqual(floor, []);
  assert.deepEqual(pickRosterNames(floor, ['继承来的旧名']), []);
});
