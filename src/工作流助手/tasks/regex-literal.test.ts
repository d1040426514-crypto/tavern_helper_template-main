import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectRegexMatchSpans, compileUserRegex, firstRegexFullMatch } from './regex-literal';

describe('compileUserRegex', () => {
  it('没写斜杠时整段当作表达式，并强制全局', () => {
    const spans = collectRegexMatchSpans('aAa', 'a');
    assert.deepEqual(
      spans.map(span => span.startIdx),
      [0, 2],
    );
  });

  it('/表达式/i 忽略大小写且能找出全部命中', () => {
    assert.equal(firstRegexFullMatch('EXAMPLE', '/example/i'), 'EXAMPLE');
    assert.equal(collectRegexMatchSpans('aAa', '/a/i').length, 3);
  });

  it('非法正则返回空', () => {
    assert.equal(compileUserRegex('/[/'), null);
    assert.equal(compileUserRegex('/a/x'), null);
    assert.equal(compileUserRegex('/a/gg'), null);
    assert.deepEqual(collectRegexMatchSpans('aaa', '/[/'), []);
  });

  it('零长度命中不会卡住', () => {
    assert.deepEqual(collectRegexMatchSpans('bbb', '/a*/'), []);
  });

  it('只用整段匹配，不用第 1 捕获组', () => {
    assert.equal(firstRegexFullMatch('时间：第1天 08:00', '/时间[:：]\\s*(第1天 08:00)/'), '时间：第1天 08:00');
  });

  it('字符类里的斜杠不当作结束符', () => {
    assert.equal(firstRegexFullMatch('A/B', '/a[/]b/i'), 'A/B');
    assert.equal(firstRegexFullMatch('/', '/[/]/'), '/');
    assert.equal(firstRegexFullMatch('[', '/[[]/'), '[');
    assert.equal(firstRegexFullMatch('a]', '/[^]]/'), 'a]');
    assert.notEqual(compileUserRegex('/[]]/'), null);
    assert.equal(compileUserRegex('/[]/'), null);
    assert.equal(compileUserRegex('/a[/b/i'), null);
    assert.equal(compileUserRegex('/http://x/'), null);
  });
});
