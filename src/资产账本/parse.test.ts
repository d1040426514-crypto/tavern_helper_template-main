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

test('parse warehouse and facilities tags', () => {
  const withEnt = parseLedgerBody(
    '<实体 name="商栈"><仓库><物资 name="粮">期初10</物资></仓库><基础设施><设施 type="锯木房" count="2" /></基础设施></实体>',
  );
  assert.equal(withEnt.entities[0]?.materials[0]?.attrs.name, '粮');
  assert.equal(withEnt.entities[0]?.facilities[0]?.type, '锯木房');
});

test('parseLedger combines LedgerTime + body', () => {
  const data = parseLedger(
    '[账目结算时间]: 第三纪元120年3月5日08:00\n门禁：通过',
    `
<本期结算>
  历时: 24h
  损益: 盈利 (Δ +320 银盾)
</本期结算>
<外因>
  <季节>初春 | 影响:谷物 ×1.1 | 供需:Loose</季节>
</外因>
<流动资金 note="多币种">
  <币种 code="A" symbol="§">期初100 +流入20 -流出5 =期末115</币种>
  <折合基准>
    ∑(期末货币 × 汇率) = 115 §
    (Δ +15) → 存放:北商行账户
  </折合基准>
</流动资金>
<实体 name="北岸工坊">
  <基础设施>
    <设施 type="锯木房" count="2" status="Normal" maintain="3银/周" />
  </基础设施>
  <人员 total="12">
    <职级 role="工匠" count="8" pay="2银/周" churn="0" />
  </人员>
</实体>
<经营 name="北岸工坊">
  <收入 合计金额="50" 周期="周">
    <条目 name="木板" amount="+50">单价:5 × 数量:10</条目>
  </收入>
  <支出 合计金额="20" 周期="周">
    <条目 name="薪饷" amount="-20" type="薪饷">计算:10×2</条目>
  </支出>
  <闭环校验 result="Pass">期初 +收入 -支出 =期末</闭环校验>
  <净值>+30 银盾/周</净值>
</经营>
<运营 name="北岸工坊">
  <执事>老刘 | 重点:扩仓 | 风险:汛期</执事>
  <项目 name="扩仓" progress="60%" bar="███░░░">阶段:砌墙</项目>
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
  assert.equal(data.entities[0]?.facilities[0]?.type, '锯木房');
  assert.equal(data.businesses[0]?.revenueItems[0]?.attrs.name, '木板');
  assert.equal(data.operations[0]?.projects[0]?.attrs.progress, '60%');
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

  const w = parseProgressPct({ progress: '20%', run: 'Idle' }, 'Idle');
  assert.equal(w.tone, 'warn');
});
