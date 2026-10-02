import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyContextTagFilters, applyExcludeRulesToText, applyExtractRulesToText } from './context-tags';

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
