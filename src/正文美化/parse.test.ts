import assert from 'node:assert/strict';
import { classifyParagraph, extractGametxt, firstGrapheme, planBeautify } from './parse';

const raw = `
<think>草稿里的 <gametxt>{不要}「这句不该出现」</gametxt></think>
<tp>复兴纪元488年 10:50</tp>
<gametxt>
<!-- beginningSheet: 开局说明 -->
⁣⁠⁣<jy-source>窓の外</jy-source>⁣⁢⁣<jy-translation>窗外，细雨敲打着玻璃。</jy-translation>

{波尔特·瓦伦}「进来。」

将声音抛在脑后。

<aurelia name="奥瑞利亚" mood="狂喜">啊—终于找到了。</aurelia>

<char_info>
姓名: 薇奥拉·斯坦因
身份: 女仆长
</char_info>

维奥拉行了一礼。

<inner_voice role="薇奥拉·斯坦因">
<jy-source>机の下</jy-source>
<jy-translation>躲在桌子底下的究竟是谁。</jy-translation>
</inner_voice>

{维奥拉·斯坦因}“公务<span class="hint">期间</span>多有打扰。”

<item_info>
<style>.item-card-letter { color: gold; }</style>
<div class="item-card-letter">邀请函</div>
</item_info>

\`\`\`html
<div>围栏前端</div>
\`\`\`
</gametxt>
<StatusPlaceHolderImpl/>
`;

const plan = planBeautify(extractGametxt(raw) ?? '');
const keys = plan.paragraphs.map(paragraph => `${paragraph.kind}:${paragraph.key}`);

assert.deepEqual(keys, [
  'prose:窗外，细雨敲打着玻璃。',
  'dialogue:{波尔特·瓦伦}「进来。」',
  'prose:将声音抛在脑后。',
  'prose:维奥拉行了一礼。',
  'dialogue:{维奥拉·斯坦因}“公务期间多有打扰。”',
]);
assert.equal(classifyParagraph('姓名: 薇奥拉·斯坦因 身份: 女仆长', plan), null);
assert.equal(classifyParagraph('躲在桌子底下的究竟是谁。', plan), null);
assert.equal(classifyParagraph('复兴纪元488年 10:50', plan), null);
assert.equal(classifyParagraph('{不要}「这句不该出现」', plan), null);
assert.equal(classifyParagraph('⁣⁣{波尔特·瓦伦}「进来。」⁣⁣', plan), 'dialogue');
assert.equal(firstGrapheme('波尔特·瓦伦'), '波');
assert.equal(firstGrapheme(''), '？');

const unknown = planBeautify(`
前言。

<skill_card>
名称: 斩击
</skill_card>

{甲}「你好。」

<foo_bar attr="1">中间内容</foo_bar>

<虚海规则>
不该进正文
</虚海规则>

后记。
`);
assert.deepEqual(
  unknown.paragraphs.map(paragraph => `${paragraph.kind}:${paragraph.key}`),
  ['prose:前言。', 'dialogue:{甲}「你好。」', 'prose:后记。'],
);
assert.equal(classifyParagraph('名称: 斩击', unknown), null);
assert.equal(classifyParagraph('中间内容', unknown), null);
assert.equal(classifyParagraph('不该进正文', unknown), null);

const inline = planBeautify(`{乙}「含<span class="x">强调</span>词」`);
assert.equal(inline.paragraphs[0]?.kind, 'dialogue');
assert.equal(inline.paragraphs[0]?.line, '含强调词');

const fullwidth = planBeautify(`｛戊｝「全角花括号。」`);
assert.equal(fullwidth.paragraphs[0]?.kind, 'dialogue');
assert.equal(fullwidth.paragraphs[0]?.name, '戊');
assert.equal(fullwidth.paragraphs[0]?.line, '全角花括号。');
assert.equal(classifyParagraph('｛戊｝「全角花括号。」', fullwidth), 'dialogue');

const mixedBrace = planBeautify(`｛己}「半全角混用不应认」\n\n{庚｝“另一半混用也不应认”`);
assert.ok(!mixedBrace.paragraphs.some(paragraph => paragraph.kind === 'dialogue'));

const unclosed = planBeautify(`
开场。

<broken>未闭合内容

{丙}「还在。」
`);
assert.deepEqual(
  unclosed.paragraphs.map(paragraph => `${paragraph.kind}:${paragraph.key}`),
  ['prose:开场。', 'dialogue:{丙}「还在。」'],
);
assert.equal(classifyParagraph('未闭合内容', unclosed), null);

const mismatched = planBeautify(`
前面。

<aurelia name="x" mood="y">黄金魔女</a>

{丁}「别吞我。」
`);
assert.ok(
  mismatched.paragraphs.some(paragraph => paragraph.key === '{丁}「别吞我。」'),
  'mismatched aurelia close must not swallow following dialogue',
);
assert.equal(
  mismatched.paragraphs.find(paragraph => paragraph.key === '{丁}「别吞我。」')?.kind,
  'dialogue',
);

console.log('ok gametxt parse');
