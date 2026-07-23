import assert from 'node:assert/strict';
import {
  buildChronicle,
  getWealthClass,
  isChronicleEmpty,
  parseAttrs,
  parseNpcBlock,
  parsePreview,
  splitNameList,
} from './parse';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('parseAttrs supports Chinese attr names', () => {
  const attrs = parseAttrs('<角色集 类型="不在场关系列表角色" 列表="甲,乙" />');
  assert.equal(attrs['类型'], '不在场关系列表角色');
  assert.equal(attrs['列表'], '甲,乙');
});

test('splitNameList handles comma and顿号', () => {
  assert.deepEqual(splitNameList('甲,乙、丙；丁'), ['甲', '乙', '丙', '丁']);
});

test('parseNpcBlock new format fields', () => {
  const block = `<npc act="李明">
行为链: 巡街→查账→后续预测: 明日回府 **[准备登场]**
当前状态: 行走|青衫|城西巷|盘问路人
资金状况: 手头宽裕
长期目标: 光复家业
近期打算: 调查走私|暗访|2026年7月1日8时—2026年7月3日18时
关联事件: [走私案]
近期记忆: 1.昨夜见黑影;2.收到密信
沉淀记忆: 1.三年前出走
核心记忆: 1.父亲托付玉佩
</npc>`;
  const npc = parseNpcBlock(block);
  assert.equal(npc.name, '李明');
  assert.deepEqual(npc.actionChain, ['巡街', '查账']);
  assert.equal(npc.predict, '明日回府');
  assert.equal(npc.debutReady, true);
  assert.deepEqual(npc.statusParts, ['行走', '青衫', '城西巷', '盘问路人']);
  assert.equal(npc.wealth, '手头宽裕');
  assert.equal(npc.longGoal, '光复家业');
  assert.equal(npc.nearPlan.length, 3);
  assert.equal(npc.relatedEvent, '走私案');
  assert.deepEqual(npc.recentMemories, ['昨夜见黑影', '收到密信']);
  assert.deepEqual(npc.settledMemories, ['三年前出走']);
  assert.deepEqual(npc.coreMemories, ['父亲托付玉佩']);
  assert.equal(npc.empty, false);
});

test('parseNpcBlock accepts inner-only text with fallback name', () => {
  const npc = parseNpcBlock(
    `行为链: A→B
资金状况: 一贫如洗`,
    '王芳',
  );
  assert.equal(npc.name, '王芳');
  assert.deepEqual(npc.actionChain, ['A', 'B']);
  assert.equal(getWealthClass(npc.wealth), 'wealth-destitute');
});

test('getWealthClass includes 富甲天下', () => {
  assert.equal(getWealthClass('富甲天下'), 'wealth-tycoon');
  assert.equal(getWealthClass('富足有余'), 'wealth-rich');
});

test('parsePreview extracts time role sets and interactions', () => {
  const xml = `<后台角色交互预演>
  <后台角色行动时间段>
    <起始时间 time="大明-1520年-3月-1日-周一-08:00" />
    <结束时间 time="大明-1520年-3月-1日-周一-18:00" />
  </后台角色行动时间段>
  <角色集 类型="不在场关系列表角色" 列表="李明,王芳" />
  <角色集 类型="不在场剧情关联背景角色" 列表="赵铁" />
  <角色集 类型="不在场时局背景角色" 列表="周监" />
  <交互 编号="E001" 角色="李明,王芳">
    简述: 巷口偶遇
    结果: 交换情报
  </交互>
</后台角色交互预演>`;
  const p = parsePreview(xml);
  assert.equal(p.startTime, '大明-1520年-3月-1日-周一-08:00');
  assert.equal(p.endTime, '大明-1520年-3月-1日-周一-18:00');
  assert.ok(p.timeBadge.includes('—'));
  assert.deepEqual(p.relationNames, ['李明', '王芳']);
  assert.deepEqual(p.plotNames, ['赵铁']);
  assert.deepEqual(p.worldNames, ['周监']);
  assert.equal(p.interactions.length, 1);
  assert.equal(p.interactions[0]?.id, 'E001');
  assert.equal(p.interactions[0]?.summary, '巷口偶遇');
  assert.equal(p.interactions[0]?.result, '交换情报');
});

test('buildChronicle classifies and dedupes; empty card for missing data', () => {
  const preview = parsePreview(`
  <角色集 类型="不在场关系列表角色" 列表="李明,王芳" />
  <角色集 类型="不在场剧情关联背景角色" 列表="李明,赵铁" />
  <角色集 类型="不在场时局背景角色" 列表="周监" />
`);
  const data = buildChronicle(preview, {
    李明: `行为链: 巡街→查账\n资金状况: 略有盈余`,
  });
  assert.equal(data.sections[0]?.npcs.length, 2);
  assert.equal(data.sections[0]?.npcs[0]?.name, '李明');
  assert.equal(data.sections[0]?.npcs[0]?.empty, false);
  assert.equal(data.sections[0]?.npcs[1]?.name, '王芳');
  assert.equal(data.sections[0]?.npcs[1]?.empty, true);
  // 李明 已在关系栏，不再进剧情栏
  assert.equal(data.sections[1]?.npcs.map(n => n.name).join(','), '赵铁');
  assert.equal(data.sections[2]?.npcs[0]?.name, '周监');
  assert.equal(isChronicleEmpty(data), false);
});

test('isChronicleEmpty true when no sections', () => {
  assert.equal(
    isChronicleEmpty({
      timeBadge: '',
      sections: [
        { key: 'relation', typeLabel: '', badge: '', icon: '', names: [], npcs: [] },
        { key: 'plot', typeLabel: '', badge: '', icon: '', names: [], npcs: [] },
        { key: 'world', typeLabel: '', badge: '', icon: '', names: [], npcs: [] },
      ],
      interactions: [],
    }),
    true,
  );
});
