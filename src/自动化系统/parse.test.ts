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

test('parseNpcBlock legacy format fields still work', () => {
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
  assert.equal(npc.background.event, '走私案');
  assert.deepEqual(npc.recentMemories, ['昨夜见黑影', '收到密信']);
  assert.deepEqual(npc.settledMemories, ['三年前出走']);
  assert.deepEqual(npc.coreMemories, ['父亲托付玉佩']);
  assert.equal(npc.empty, false);
});

test('parseNpcBlock new format reputation social background', () => {
  const block = `<npc act="佐久夜">
行为链: 观测→锁定→后续预测: 继续巡狩
当前状态: 甩干水迹|黑大衣|黑水巷|清洗手帕
资金状况: 略有盈余
声誉: [官方]声名狼藉|[民间]天怒人怨|[暗域]小有名气|[业界]声名狼藉
社交网络: [恩怨]已故血族主人(仇恨/已终结);[邻里]黑水巷酒鬼(厌恶/潜在猎物)|[职场]女仆公会(无视/潜在关联)
背景关联: [团体]无|[社交圈]索伦蒂斯深夜游荡者|[事件]无
长期目标: 寻找到一位完美主人
近期打算: 清理不洁根源|猎杀行动|复兴纪元488年4月15日23:30—4月16日03:00
近期记忆: 1.黑水巷的雨幕;2.今晚的雾气太重
沉淀记忆: 1.上周处理掉的混混
核心记忆: 1.血族主人的头颅;2.月都怀表;3.母亲死去时的臭味
</npc>`;
  const npc = parseNpcBlock(block);
  assert.equal(npc.name, '佐久夜');
  assert.equal(npc.reputation.length, 4);
  assert.deepEqual(npc.reputation[0], { label: '官方', value: '声名狼藉' });
  assert.deepEqual(npc.reputation[2], { label: '暗域', value: '小有名气' });
  assert.equal(npc.socialNetwork.length, 3);
  assert.equal(npc.socialNetwork[0]!.category, '恩怨');
  assert.equal(npc.socialNetwork[0]!.people[0]!.name, '已故血族主人');
  assert.equal(npc.socialNetwork[0]!.people[0]!.note, '仇恨/已终结');
  assert.equal(npc.socialNetwork[1]!.category, '邻里');
  assert.equal(npc.socialNetwork[1]!.people[0]!.name, '黑水巷酒鬼');
  assert.equal(npc.socialNetwork[2]!.category, '职场');
  assert.equal(npc.socialNetwork[2]!.people[0]!.name, '女仆公会');
  assert.equal(npc.background.group, '无');
  assert.equal(npc.background.circle, '索伦蒂斯深夜游荡者');
  assert.equal(npc.background.event, '无');
  assert.equal(npc.relatedEvent, '无');
  assert.equal(npc.coreMemories.length, 3);
  assert.equal(npc.wealth, '略有盈余');
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
  assert.deepEqual(npc.reputation, []);
  assert.deepEqual(npc.socialNetwork, []);
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
  <角色集 类型="不在场时局背景角色" 列表="" />
  <交互 编号="E01" 角色="李明,王芳">
简述: 街头偶遇
结果: 交换情报
  </交互>
</后台角色交互预演>`;
  const preview = parsePreview(xml);
  assert.ok(preview.timeBadge.includes('1520'));
  assert.deepEqual(preview.relationNames, ['李明', '王芳']);
  assert.deepEqual(preview.plotNames, ['赵铁']);
  assert.equal(preview.interactions.length, 1);
  assert.equal(preview.interactions[0]!.summary, '街头偶遇');
});

test('buildChronicle prefers relation over plot for same name', () => {
  const preview = parsePreview(`<后台角色交互预演>
  <起始时间 time="t1" />
  <结束时间 time="t2" />
  <角色集 类型="不在场关系列表角色" 列表="李明" />
  <角色集 类型="不在场剧情关联背景角色" 列表="李明,赵铁" />
</后台角色交互预演>`);
  const chronicle = buildChronicle(preview, {
    李明: `行为链: 巡街→查账
资金状况: 略有盈余`,
    赵铁: `行为链: X`,
  });
  const relation = chronicle.sections.find(s => s.key === 'relation')!;
  const plot = chronicle.sections.find(s => s.key === 'plot')!;
  assert.equal(relation.npcs.length, 1);
  assert.equal(relation.npcs[0]!.name, '李明');
  assert.equal(plot.npcs.length, 1);
  assert.equal(plot.npcs[0]!.name, '赵铁');
  assert.equal(isChronicleEmpty(chronicle), false);
});
