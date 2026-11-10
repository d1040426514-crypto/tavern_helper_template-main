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
assert.equal(
  classifyParagraph('姓名: 薇奥拉·斯坦因 身份: 女仆长', plan),
  null,
);
assert.equal(classifyParagraph('躲在桌子底下的究竟是谁。', plan), null);
assert.equal(classifyParagraph('复兴纪元488年 10:50', plan), null);
assert.equal(classifyParagraph('{不要}「这句不该出现」', plan), null);
assert.equal(classifyParagraph('⁣⁣{波尔特·瓦伦}「进来。」⁣⁣', plan), 'dialogue');
assert.equal(firstGrapheme('波尔特·瓦伦'), '波');
assert.equal(firstGrapheme(''), '？');

console.log('ok gametxt parse');
