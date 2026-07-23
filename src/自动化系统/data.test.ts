import assert from 'node:assert/strict';
import { filterNpcByLaunched, flattenNpcActTags } from './data';
import { buildChronicle, parsePreview } from './parse';

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

test('filterNpcByLaunched null keeps all', () => {
  const src = { 甲: 'a', 乙: 'b' };
  assert.deepEqual(filterNpcByLaunched(src, null), src);
  assert.deepEqual(filterNpcByLaunched(src, []), src);
});

test('filterNpcByLaunched keeps only launched', () => {
  const src = { 甲: 'a', 乙: 'b', 丙: 'c' };
  assert.deepEqual(filterNpcByLaunched(src, ['乙', '丁']), { 乙: 'b' });
});

test('end-to-end preview + filtered npc map', () => {
  const preview = parsePreview(`
    <角色集 类型="不在场关系列表角色" 列表="李明,王芳" />
    <角色集 类型="不在场时局背景角色" 列表="周监" />
  `);
  const all = flattenNpcActTags({
    npc_act: {
      李明: '行为链: 巡街→查账\n资金状况: 手头宽裕',
      无关人: '行为链: X',
    },
  });
  const filtered = filterNpcByLaunched(all, ['李明', '无关人']);
  const data = buildChronicle(preview, filtered);
  assert.equal(data.sections[0]?.npcs[0]?.name, '李明');
  assert.equal(data.sections[0]?.npcs[0]?.wealth, '手头宽裕');
  assert.equal(data.sections[0]?.npcs[1]?.empty, true);
  assert.equal(data.sections[2]?.npcs[0]?.empty, true);
});
