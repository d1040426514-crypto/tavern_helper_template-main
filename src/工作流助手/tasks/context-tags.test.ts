import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyContextTagFilters, applyExcludeRulesToText, applyExtractRulesToText, normalizeContextTagRules } from './context-tags';

describe('applyExtractRulesToText', () => {
  it('两段都闭合则都保留', () => {
    const text = '<示例>甲</示例><示例>乙</示例>';
    assert.equal(applyExtractRulesToText(text, [{ start: '<示例>', end: '</示例>' }]), '<示例>甲</示例>\n\n<示例>乙</示例>');
  });

  it('前面多一个未闭合开标签时只保留后面那对', () => {
    const text = '<示例>孤儿<示例>闭合</示例>';
    assert.equal(applyExtractRulesToText(text, [{ start: '<示例>', end: '</示例>' }]), '<示例>闭合</示例>');
  });

  it('前面多一个未闭合注释时只保留后面那段', () => {
    const text = '<!-- 孤儿 <!-- 闭合 -->';
    assert.equal(applyExtractRulesToText(text, [{ start: '<!--', end: '-->' }]), '<!-- 闭合 -->');
  });

  it('无命中时返回原文', () => {
    const text = '<示例>没有结束';
    assert.equal(applyExtractRulesToText(text, [{ start: '<示例>', end: '</示例>' }]), text);
  });

  it('两条规则交错时按原文位置穿插', () => {
    const text = '<时间>早</时间>\n<正文>上</正文>\n<时间>晚</时间>\n<正文>下</正文>';
    const out = applyExtractRulesToText(text, [
      { start: '<时间>', end: '</时间>' },
      { start: '<正文>', end: '</正文>' },
    ]);
    assert.equal(out, '<时间>早</时间>\n\n<正文>上</正文>\n\n<时间>晚</时间>\n\n<正文>下</正文>');
  });

  it('残缺开标签前缀仍只匹配合法延续', () => {
    const text = '<tpx>no</tpx><tp>yes</tp>';
    assert.equal(applyExtractRulesToText(text, [{ start: '<tp', end: '</tp>' }]), '<tp>yes</tp>');
  });

  it('紧挨英文或空注释的 XML 注释按字面量保留', () => {
    const text = '前文<!--foo-->中<!---->后文';
    assert.equal(
      applyExtractRulesToText(text, [{ start: '<!--', end: '-->' }]),
      '<!--foo-->\n\n<!---->',
    );
  });

  it('残缺的 <! 仍配不上注释', () => {
    const text = '前文<!--foo-->后文';
    assert.equal(applyExtractRulesToText(text, [{ start: '<!', end: '-->' }]), text);
  });
});

describe('applyExcludeRulesToText', () => {
  it('两段都闭合则都删除', () => {
    const text = '前文<示例>甲</示例>中<示例>乙</示例>后文';
    assert.equal(applyExcludeRulesToText(text, [{ start: '<示例>', end: '</示例>' }]), '前文中后文');
  });

  it('未闭合开标签不删，后面的闭合对会删', () => {
    const text = '<示例>孤儿<示例>闭合</示例>尾';
    assert.equal(applyExcludeRulesToText(text, [{ start: '<示例>', end: '</示例>' }]), '<示例>孤儿尾');
  });

  it('未闭合注释不删，后面的闭合注释会删', () => {
    const text = '<!-- 孤儿 <!-- 闭合 -->尾';
    assert.equal(applyExcludeRulesToText(text, [{ start: '<!--', end: '-->' }]), '<!-- 孤儿 尾');
  });

  it('紧挨英文或空注释的 XML 注释都会删除', () => {
    const text = '前文<!--foo-->中<!---->后文';
    assert.equal(applyExcludeRulesToText(text, [{ start: '<!--', end: '-->' }]), '前文中后文');
  });

  it('残缺的 <! 仍删不掉注释', () => {
    const text = '前文<!--foo-->后文';
    assert.equal(applyExcludeRulesToText(text, [{ start: '<!', end: '-->' }]), text);
  });
});

describe('applyContextTagFilters', () => {
  it('先提取再排除，排除只作用于提取结果', () => {
    const text = '<时间>早</时间><!-- 注 --><正文>上</正文>';
    const out = applyContextTagFilters(
      text,
      [
        { start: '<时间>', end: '</时间>' },
        { start: '<正文>', end: '</正文>' },
      ],
      [{ start: '<!--', end: '-->' }],
    );
    assert.equal(out, '<时间>早</时间>\n\n<正文>上</正文>');
  });
});

describe('正则匹配', () => {
  it('提取保留整段匹配，并和边界命中按原文顺序拼接', () => {
    const text = '前<示例>甲</示例>后EXAMPLE';
    const out = applyExtractRulesToText(text, [
      { start: '', end: '', mode: 'regex', pattern: '/example/i' },
      { start: '<示例>', end: '</示例>' },
    ]);
    assert.equal(out, '<示例>甲</示例>\n\nEXAMPLE');
  });

  it('排除只删开闭标签时正文还在', () => {
    const text = '<div class="x">正文</div>';
    const out = applyExcludeRulesToText(text, [
      { start: '', end: '', mode: 'regex', pattern: '/<div\\b[^>]*>|<\\/div>/gi' },
    ]);
    assert.equal(out, '正文');
  });

  it('非法正则被跳过，其它规则仍生效', () => {
    const text = '<示例>甲</示例>';
    const out = applyExtractRulesToText(text, [
      { start: '', end: '', mode: 'regex', pattern: '/[/' },
      { start: '<示例>', end: '</示例>' },
    ]);
    assert.equal(out, '<示例>甲</示例>');
  });

  it('/表达式/i 忽略大小写', () => {
    const text = '前example中EXAMPLE后';
    const out = applyExtractRulesToText(text, [{ start: '', end: '', mode: 'regex', pattern: '/example/i' }]);
    assert.equal(out, 'example\n\nEXAMPLE');
  });

  it('排除按当前文本逐条处理', () => {
    const text = 'aXb';
    const out = applyExcludeRulesToText(text, [
      { start: '', end: '', mode: 'regex', pattern: '/X/' },
      { start: '', end: '', mode: 'regex', pattern: '/ab/' },
    ]);
    assert.equal(out, '');
  });

  it('规范化保留只有 pattern 的正则规则', () => {
    const rules = normalizeContextTagRules([{ mode: 'regex', pattern: '  /a/i  ' }]);
    assert.deepEqual(rules, [{ start: '', end: '', mode: 'regex', pattern: '/a/i', name: '' }]);
  });

  it('规范化保留正则名称', () => {
    const rules = normalizeContextTagRules([{ mode: 'regex', pattern: '/a/i', name: ' 剥标签 ' }]);
    assert.equal(rules[0]?.name, '剥标签');
  });
});
