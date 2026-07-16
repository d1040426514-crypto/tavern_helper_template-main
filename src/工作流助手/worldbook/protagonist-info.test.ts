import assert from 'node:assert/strict';
import test from 'node:test';
import { isProtagonistInfoWorldbookEntry, resolveProtagonistExportEntryName } from './blocked';

test('resolveProtagonistExportEntryName falls back to default', () => {
  assert.equal(resolveProtagonistExportEntryName(undefined), '主角信息');
  assert.equal(resolveProtagonistExportEntryName({ other: { name: '其他表' } }), '主角信息');
});

test('isProtagonistInfoWorldbookEntry respects custom entryName from tablesJson', () => {
  const entryName = resolveProtagonistExportEntryName({
    sheet_a: {
      name: '主角信息表',
      exportConfig: { entryName: '玩家状态' },
    },
  });
  assert.equal(entryName, '玩家状态');
  assert.equal(isProtagonistInfoWorldbookEntry('TavernDB-ACU-CustomExport-玩家状态-表头', entryName), true);
  assert.equal(isProtagonistInfoWorldbookEntry('TavernDB-ACU-CustomExport-主角信息-表头', entryName), false);
});
