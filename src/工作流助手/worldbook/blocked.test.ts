import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAutoIncludedPlotWorldbookEntry,
  isChronicleMemoryWorldbookEntry,
  isManagedPlotWorldbookEntry,
  isPlotDollar1AutoIncludedEntry,
  isWorkflowHelperManagedEntry,
  shouldShowEntryInUi,
} from './blocked';
import type { ChatWorldbookWriteRule } from '../tasks/schema';

function baseRule(overrides: Partial<ChatWorldbookWriteRule> = {}): ChatWorldbookWriteRule {
  return {
    id: 'r1',
    targetTag: 'item@name',
    template: '{{item@name}}',
    entryName: '',
    bookSource: 'character',
    manualBookName: '',
    entryType: 'constant',
    keywords: '',
    splitByAttr: false,
    wrapTagName: '',
    placement: { position: 'at_depth_as_system', depth: 2, order: 10000 },
    preventRecursion: true,
    ...overrides,
  };
}

test('isWorkflowHelperManagedEntry matches default prefix', () => {
  assert.equal(isWorkflowHelperManagedEntry('WorkflowHelper-result'), true);
  assert.equal(isWorkflowHelperManagedEntry('普通条目'), false);
});

test('isChronicleMemoryWorldbookEntry matches summary prefixes', () => {
  assert.equal(isChronicleMemoryWorldbookEntry('总结条目1'), true);
  assert.equal(isChronicleMemoryWorldbookEntry('小总结条目2'), true);
  assert.equal(isChronicleMemoryWorldbookEntry('TavernDB-ACU-foo'), false);
});

test('isPlotDollar1AutoIncludedEntry excludes managed and chronicle', () => {
  assert.equal(isPlotDollar1AutoIncludedEntry('TavernDB-ACU-foo'), true);
  assert.equal(isPlotDollar1AutoIncludedEntry('重要人物条目-x'), true);
  assert.equal(isPlotDollar1AutoIncludedEntry('WorkflowHelper-item'), false);
  assert.equal(isPlotDollar1AutoIncludedEntry('总结条目1'), false);
  assert.equal(isPlotDollar1AutoIncludedEntry('普通条目'), false);
});

test('isManagedPlotWorldbookEntry matches WorkflowHelper and custom entryName', () => {
  assert.equal(isManagedPlotWorldbookEntry('WorkflowHelper-item name-剑'), true);
  const rules = [baseRule({ entryName: 'MyEntry-{attrValue}', splitByAttr: true })];
  assert.equal(isManagedPlotWorldbookEntry('MyEntry-断剑', rules), true);
  assert.equal(isManagedPlotWorldbookEntry('MyEntry-断剑', []), false);
});

test('isAutoIncludedPlotWorldbookEntry still covers DB and managed for UI hide', () => {
  assert.equal(isAutoIncludedPlotWorldbookEntry('TavernDB-ACU-foo'), true);
  assert.equal(isAutoIncludedPlotWorldbookEntry('WorkflowHelper-item name-剑'), true);
  assert.equal(isAutoIncludedPlotWorldbookEntry('普通条目'), false);
});

test('shouldShowEntryInUi hides auto-included entries', () => {
  assert.equal(shouldShowEntryInUi({ name: 'WorkflowHelper-result' }), false);
  assert.equal(shouldShowEntryInUi({ name: 'TavernDB-ACU-ReadableDataTable' }), false);
  assert.equal(shouldShowEntryInUi({ name: '普通剧情设定' }), true);
  const rules = [baseRule({ entryName: 'CustomPrefix' })];
  assert.equal(shouldShowEntryInUi({ name: 'CustomPrefix-foo' }, rules), false);
  assert.equal(shouldShowEntryInUi({ name: 'CustomPrefix-foo' }), true);
});
