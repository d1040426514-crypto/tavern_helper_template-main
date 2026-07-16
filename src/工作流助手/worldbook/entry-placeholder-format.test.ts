import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePlaceholderEntryContent,
  shouldOmitEntryTitleInPlaceholder,
  stripShujukuInnerTableTitle,
} from './entry-placeholder-format';

test('shouldOmitEntryTitleInPlaceholder matches shujuku DB entries only', () => {
  assert.equal(shouldOmitEntryTitleInPlaceholder('TavernDB-ACU-CustomExport-伏笔-1'), true);
  assert.equal(shouldOmitEntryTitleInPlaceholder('TavernDB-ACU-ReadableDataTable'), true);
  assert.equal(shouldOmitEntryTitleInPlaceholder('WorkflowHelper-item'), false);
});

test('stripShujukuInnerTableTitle removes leading markdown heading before table', () => {
  const content = [
    '# 主角信息表',
    '',
    '| 姓名 | 近况 |',
    '|---|---|',
    '| 波尔特 | 正常 |',
  ].join('\n');
  assert.equal(
    stripShujukuInnerTableTitle(content),
    ['| 姓名 | 近况 |', '|---|---|', '| 波尔特 | 正常 |'].join('\n'),
  );
});

test('normalizePlaceholderEntryContent keeps non-db titles untouched', () => {
  const content = '# 普通设定\n\n正文';
  assert.equal(
    normalizePlaceholderEntryContent({ normalizedComment: '普通条目', content }, content),
    content,
  );
});
