import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePlaceholderEntryContent,
  prepareRawPlaceholderEntryContent,
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

test('stripShujukuInnerTableTitle keeps wrapper between heading and table', () => {
  const content = [
    '# 以下为已经出现过的地点及其最新信息：',
    '',
    '<已出现地点>',
    '| 地点名 | 上级地区 |',
    '|---|---|',
    '| 市政府 | 鲜嫩之珠 |',
    '</已出现地点>',
  ].join('\n');
  assert.equal(stripShujukuInnerTableTitle(content), content);
});

test('prepareRawPlaceholderEntryContent preserves index entry wrappers', () => {
  const content = [
    '# 以下为已经出现过的地点及其最新信息：',
    '',
    '<已出现地点>',
    '| 地点名 | 上级地区 |',
    '|---|---|',
    '| 市政府 | 鲜嫩之珠 |',
    '</已出现地点>',
  ].join('\n');
  assert.equal(
    prepareRawPlaceholderEntryContent({
      normalizedComment: 'TavernDB-ACU-CustomExport-地点表-索引',
      content,
    }),
    content,
  );
});

test('prepareRawPlaceholderEntryContent strips default inner title for non-index DB entries', () => {
  const content = [
    '# 主角信息表',
    '',
    '| 姓名 | 近况 |',
    '|---|---|',
    '| 波尔特 | 正常 |',
  ].join('\n');
  assert.equal(
    prepareRawPlaceholderEntryContent({
      normalizedComment: 'TavernDB-ACU-CustomExport-主角信息',
      content,
    }),
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
