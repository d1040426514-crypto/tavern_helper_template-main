import assert from 'node:assert/strict';
import {
  findAllPairs,
  parseAttrs,
  parseCashBaseTotal,
  parseCashMetrics,
  parseLedger,
  parseLedgerBody,
  parseProgressPct,
} from './parse.ts';

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
  const attrs = parseAttrs('<收入 合计金额="120" 周期="月">');
  assert.equal(attrs['合计金额'], '120');
  assert.equal(attrs['周期'], '月');
});

test('parseAttrs supports total attr', () => {
  const attrs = parseAttrs('<收入 total="50" 周期="周">');
  assert.equal(attrs.total, '50');
});

test('parse warehouse and facilities tags', () => {
  const withEnt = parseLedgerBody(
    '<实体 name="商栈"><仓库><物资 name="粮">期初10</物资></仓库><基础设施><设施 type="锯木房" count="2" /></基础设施></实体>',
  );
  assert.equal(withEnt.entities[0]?.materials[0]?.attrs.name, '粮');
  assert.equal(withEnt.entities[0]?.facilities[0]?.type, '锯木房');
});

test('parseLedger combines LedgerTime + body (new template)', () => {
  const data = parseLedger(
    '[账目结算时间]: 第三纪元120年3月5日08:00\n门禁：通过',
    `
<本期结算>
  历时: 24h
  损益: 盈利 (Δ +320 银盾)
</本期结算>
<外因>
  <季节 name="初春">初春回暖 | 影响:谷物 ×1.1 | 供需:Loose</季节>
</外因>
<流动资金 note="多币种">
  <币种 code="A" symbol="§">期初100 +流入20 -流出5 =期末115</币种>
  <折合基准>
    ∑(期末货币 × 汇率) = 115 §
    (Δ +15) → 存放:北商行账户
  </折合基准>
</流动资金>
<实体 name="北岸工坊" location="北岸码头">
  <基础设施>
    <设施 type="锯木房" count="2" status="Normal" maintain="3银/周" />
  </基础设施>
  <人员 total="12">
    <职级 role="工匠" count="8" cost="2银/周" costType="薪饷" 变动="0" status="满编" />
  </人员>
</实体>
<经营 name="北岸工坊">
  <收入 total="50" 周期="周">
    <条目 name="木板" amount="+50">单价:5 × 数量:10</条目>
  </收入>
  <支出 total="20" 周期="周">
    <条目 name="薪饷" amount="-20" type="薪饷">计算:10×2</条目>
  </支出>
  <闭环校验 result="Pass">期初 +收入 -支出 =期末</闭环校验>
  <净值>+30 银盾/周</净值>
</经营>
<运营 name="北岸工坊">
  <主管 name="老刘">重点:扩仓 | 风险:汛期</主管>
  <项目 name="扩仓" progress="60%">阶段:砌墙</项目>
</运营>
`,
  );

  assert.match(data.ledgerTime.timeLine, /账目结算时间/);
  assert.equal(data.headline.status, '盈利');
  assert.match(data.headline.delta, /\+320/);
  assert.equal(data.externalFactors[0]?.attrs._tag, '季节');
  assert.equal(data.currencies[0]?.symbol, '§');
  assert.equal(data.cashTotal, '115 §');
  assert.equal(data.entities[0]?.name, '北岸工坊');
  assert.equal(data.entities[0]?.location, '北岸码头');
  assert.equal(data.entities[0]?.facilities[0]?.type, '锯木房');
  assert.equal(data.businesses[0]?.revenueTotal, '50');
  assert.equal(data.businesses[0]?.expenseTotal, '20');
  assert.equal(data.businesses[0]?.revenueItems[0]?.attrs.name, '木板');
  assert.equal(data.operations[0]?.managerName, '老刘');
  assert.match(data.operations[0]?.manager ?? '', /重点:扩仓/);
  assert.equal(data.operations[0]?.projects[0]?.attrs.progress, '60%');
});

test('legacy 合计金额 and 执事 still parse', () => {
  const body = parseLedgerBody(`
<经营 name="旧坊">
  <收入 合计金额="50" 周期="周">
    <条目 name="木板" amount="+50">单价:5</条目>
  </收入>
  <支出 合计金额="20" 周期="周"></支出>
</经营>
<运营 name="旧坊">
  <执事>老刘 | 重点:扩仓 | 风险:汛期</执事>
</运营>
`);
  assert.equal(body.businesses[0]?.revenueTotal, '50');
  assert.equal(body.businesses[0]?.expenseTotal, '20');
  assert.equal(body.operations[0]?.managerName, '');
  assert.match(body.operations[0]?.manager ?? '', /老刘/);
});

test('revenueNote when no 条目', () => {
  const body = parseLedgerBody(`
<经营 name="停工坊">
  <收入 total="0" 周期="周">
    原因:本周停工无销售
  </收入>
</经营>
`);
  assert.equal(body.businesses[0]?.revenueTotal, '0');
  assert.equal(body.businesses[0]?.revenueItems.length, 0);
  assert.match(body.businesses[0]?.revenueNote ?? '', /原因:本周停工无销售/);
});

test('parse staff meta, roles and key persons', () => {
  const body = parseLedgerBody(`
<实体 name="北岸工坊" location="北岸码头">
  <人员 total="12" 在岗="11" note="1人外派押运">
    <职级 role="工匠" count="8" cost="2银/人/周" costType="薪饷" 变动="0" status="满编" level="熟练" />
    <核心人物 name="老刘" role="主管" cost="5银/周" costType="薪饷" status="在岗">
      忠诚:高 | 技能:督造精通 | 本期:督建扩仓项目
    </核心人物>
  </人员>
</实体>
`);
  const ent = body.entities[0];
  assert.equal(ent?.location, '北岸码头');
  assert.equal(ent?.staffTotal, '12');
  assert.equal(ent?.staffOnDuty, '11');
  assert.equal(ent?.staffNote, '1人外派押运');
  assert.equal(ent?.roles[0]?.cost, '2银/人/周');
  assert.equal(ent?.roles[0]?.level, '熟练');
  assert.equal(ent?.roles[0]?.status, '满编');
  assert.equal(ent?.keyPersons[0]?.attrs.name, '老刘');
  assert.equal(ent?.keyPersons[0]?.attrs.role, '主管');
  assert.match(ent?.keyPersons[0]?.text ?? '', /忠诚:高/);
  assert.match(ent?.keyPersons[0]?.text ?? '', /本期:督建扩仓项目/);
});

test('findAllPairs self-closing', () => {
  const hits = findAllPairs('<设施 type="A" count="1" />', '设施');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].attrs.type, 'A');
});

test('parseCashMetrics extracts total and delta', () => {
  const m = parseCashMetrics('期初100 +流入20 -流出5 =期末115\n(Δ +15 | 原因:售货)');
  assert.equal(m.total, '115');
  assert.equal(m.change, '+15');
  assert.equal(m.changeDir, 'up');

  const down = parseCashMetrics('期末90 (Δ -10)');
  assert.equal(down.changeDir, 'down');
});

test('parseCashBaseTotal extracts amount after equals', () => {
  assert.equal(parseCashBaseTotal('∑(期末货币 × 汇率) = 115 §\n(Δ +15) → 存放:北商行账户'), '115 §');
  assert.equal(parseCashBaseTotal('= -500G 帝冕币'), '-500G 帝冕币');
  assert.equal(parseCashBaseTotal('无等号文案'), '');
});

test('parseProgressPct from progress and bar', () => {
  const a = parseProgressPct({ progress: '60%', bar: '███░░░' });
  assert.equal(a.pct, 60);

  const b = parseProgressPct({ bar: '████░░░░' });
  assert.equal(b.pct, 50);

  const onlyProgress = parseProgressPct({ progress: '60%' });
  assert.equal(onlyProgress.pct, 60);

  const w = parseProgressPct({ progress: '20%', run: 'Idle' }, 'Idle');
  assert.equal(w.tone, 'warn');
});
