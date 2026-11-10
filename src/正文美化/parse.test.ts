import assert from 'node:assert/strict';
import { canonicalName } from './avatar';
import {
  classifyParagraph,
  extractGametxt,
  firstGrapheme,
  groupLineRanges,
  matchInnerVoice,
  parseDialogue,
  planBeautify,
} from './parse';

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

assert.deepEqual(plan.innerVoices, [
  { index: 0, role: '薇奥拉·斯坦因', key: '躲在桌子底下的究竟是谁。', parts: ['躲在桌子底下的究竟是谁。'] },
]);
assert.equal(matchInnerVoice('\n\n躲在桌子底下的究竟是谁。\n', plan)?.role, '薇奥拉·斯坦因');

const voices = planBeautify(`
<inner_voice role="波尔特·瓦伦">
⁣⁠⁣<jy-source><p style="color: #63b3ed;">私の意識の中に……</p></jy-source>
<jy-translation>（我的意识里居然有人存在？）</jy-translation>
</inner_voice>

<inner_voice role="阿米娅">
<p style="color: #E8A87C;font-style: italic;">他会相信我吗</p>
</inner_voice>

{甲}「我的意识里居然有人存在？」
`);
assert.deepEqual(
  voices.innerVoices.map(voice => `${voice.role}:${voice.key}`),
  ['波尔特·瓦伦:我的意识里居然有人存在？', '阿米娅:他会相信我吗'],
);
assert.equal(matchInnerVoice('我的意识里居然有人存在？', voices)?.role, '波尔特·瓦伦');
assert.equal(matchInnerVoice('他会相信我吗', voices)?.role, '阿米娅');
assert.equal(matchInnerVoice('{甲}「我的意识里居然有人存在？」', voices), null);
assert.equal(matchInnerVoice('无关', voices), null);

// 无镜译：单换行混排，逐行识别
const singleLine = planBeautify(`叙述一。
{甲}「你好。」
{乙}「嗯，走吧。」
叙述二。`);
assert.equal(classifyParagraph('{甲}「你好。」', singleLine), 'dialogue');
assert.equal(classifyParagraph('{乙}「嗯，走吧。」', singleLine), 'dialogue');
assert.equal(classifyParagraph('叙述一。', singleLine), 'prose');
assert.equal(classifyParagraph('叙述二。', singleLine), 'prose');

// 跨行对白合成一句
const multiLine = planBeautify(`{甲}「第一句。
第二句。」
叙述。`);
assert.equal(classifyParagraph('{甲}「第一句。 第二句。」', multiLine), 'dialogue');
assert.equal(multiLine.paragraphs.find(paragraph => paragraph.kind === 'dialogue')?.line, '第一句。 第二句。');
assert.deepEqual(groupLineRanges(['{甲}「第一句。', '第二句。」', '叙述。']), [
  [0, 1],
  [2, 2],
]);
// 未闭合时遇到下一个说话头就放弃合并
assert.deepEqual(groupLineRanges(['{甲}「没闭合', '{乙}「新的一句」']), [
  [0, 0],
  [1, 1],
]);

// 两人的话挤在一行，不能贪婪并成一句
assert.equal(parseDialogue('{甲}「a」{乙}「b」'), null);
assert.equal(parseDialogue('{甲}「a」 ｛乙｝“b”'), null);
assert.equal(parseDialogue('{甲}「他说了「好」。」')?.line, '他说了「好」。');

// markdown 强调：原文带 *，页面不带，两侧 key 要一致
const emphasis = planBeautify(`{甲}「含*强调*词」`);
assert.equal(classifyParagraph('{甲}「含强调词」', emphasis), 'dialogue');

// 无镜译内心话：标准、纯文本、多段短句、同角色两段
const plainVoices = planBeautify(`
叙述。
<inner_voice role="甲">
<p style="color:#E8A87C">短一</p>
<p style="color:#E8A87C">短二</p>
</inner_voice>

<inner_voice role="甲">真烦</inner_voice>

{甲}「真烦」
`);
assert.deepEqual(
  plainVoices.innerVoices.map(voice => `${voice.index}:${voice.role}:${voice.parts.join('/')}`),
  ['0:甲:短一/短二', '1:甲:真烦'],
);
assert.equal(matchInnerVoice('短一', plainVoices)?.index, 0);
assert.equal(matchInnerVoice('短二', plainVoices)?.index, 0);
assert.equal(matchInnerVoice('真烦', plainVoices)?.index, 1);
assert.equal(matchInnerVoice('{甲}「真烦」', plainVoices), null);
assert.equal(classifyParagraph('短一', plainVoices), null);

// 中间点：匹配侧统一，半角/全角/半角片假名等价
assert.equal(canonicalName('波尔特・瓦伦'), canonicalName('波尔特·瓦伦'));
assert.equal(canonicalName('ヘンドリック･フォルクマー'), canonicalName('ヘンドリック・フォルクマー'));
assert.equal(canonicalName('波尔特•瓦伦'), canonicalName('波尔特·瓦伦'));
assert.equal(canonicalName('阿米娅'), '阿米娅');

console.log('ok gametxt parse');
