import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectStageTagsForRule,
  hasConfiguredChatBodyTagReplaceRules,
  replaceBareTagLastInner,
  replaceTagInnersInMessage,
  shouldClearStalePostProcessRunMarkers,
} from './chat-body-tag-replace';
import type { TaskRunResult } from './runtime';
import type { ScriptSettings } from './schema';

function stageResult(extractedTags: Record<string, string>): TaskRunResult {
  return {
    taskId: 't1',
    taskName: 'T1',
    success: true,
    extractedBlock: '',
    extractedTags,
    injectOnlyTagNames: [],
    rawResponse: '',
    promptMessages: [],
    durationMs: 0,
    stage: 1,
  };
}

test('replaceBareTagLastInner replaces last instance only', () => {
  const text = '<content>old</content>mid<content>orig</content>';
  const out = replaceBareTagLastInner(text, 'content', 'REPLACED');
  assert.equal(out, '<content>old</content>mid<content>REPLACED</content>');
});

test('replaceBareTagLastInner with unclosed prefix', () => {
  const text = '<content>...<content>....</content>';
  const out = replaceBareTagLastInner(text, 'content', 'NEW');
  assert.equal(out, '<content>...<content>NEW</content>');
});

test('collectStageTagsForRule bare name', () => {
  const tags = collectStageTagsForRule([stageResult({ content: 'new' })], 'content');
  assert.equal(tags.content, 'new');
});

test('collectStageTagsForRule item@id', () => {
  const tags = collectStageTagsForRule(
    [stageResult({ 'item@id=1': 'A', 'item@id=2': 'B' })],
    'item@id',
  );
  assert.equal(tags['item@id=1'], 'A');
  assert.equal(tags['item@id=2'], 'B');
});

test('replaceTagInnersInMessage item@id only matching id', () => {
  const text = '<item id="1">x</item><item id="2">y</item>';
  const out = replaceTagInnersInMessage(text, 'item@id', { 'item@id=1': 'A2' });
  assert.equal(out, '<item id="1">A2</item><item id="2">y</item>');
});

test('collectStageTagsForRule skips failed tasks', () => {
  const failed = stageResult({ content: 'x' });
  failed.success = false;
  const tags = collectStageTagsForRule([failed], 'content');
  assert.deepEqual(tags, {});
});

test('collectStageTagsForRule same key overwrites across tasks', () => {
  const first = stageResult({ content: 'first' });
  first.taskId = 't1';
  const second = stageResult({ content: 'second' });
  second.taskId = 't2';
  const tags = collectStageTagsForRule([first, second], 'content');
  assert.equal(tags.content, 'second');
});

test('collectStageTagsForRule item@id=same value overwrites', () => {
  const first = stageResult({ 'item@id=1': 'A' });
  first.taskId = 't1';
  const second = stageResult({ 'item@id=1': 'B' });
  second.taskId = 't2';
  const tags = collectStageTagsForRule([first, second], 'item@id');
  assert.equal(tags['item@id=1'], 'B');
});

test('shouldClearStalePostProcessRunMarkers detects inherited done without inject suffix', () => {
  assert.equal(
    shouldClearStalePostProcessRunMarkers({
      hadDone: true,
      message: 'fresh ai text',
      inject: '<资产账本/>',
      explicitIsRerun: false,
    }),
    true,
  );
});

test('shouldClearStalePostProcessRunMarkers keeps legitimately processed floor', () => {
  assert.equal(
    shouldClearStalePostProcessRunMarkers({
      hadDone: true,
      message: 'body\n<资产账本/>',
      inject: '<资产账本/>',
      explicitIsRerun: false,
    }),
    false,
  );
});

test('shouldClearStalePostProcessRunMarkers skips explicit rerun', () => {
  assert.equal(
    shouldClearStalePostProcessRunMarkers({
      hadDone: true,
      message: 'fresh',
      inject: '<资产账本/>',
      explicitIsRerun: true,
    }),
    false,
  );
});

test('hasConfiguredChatBodyTagReplaceRules ignores empty rules', () => {
  assert.equal(
    hasConfiguredChatBodyTagReplaceRules({
      chatBodyTagReplaceRules: [{ id: '1', targetTag: '', template: '' }],
    } as ScriptSettings),
    false,
  );
  assert.equal(
    hasConfiguredChatBodyTagReplaceRules({
      chatBodyTagReplaceRules: [{ id: '1', targetTag: 'gametxt', template: '{{task:x}}' }],
    } as ScriptSettings),
    true,
  );
});

console.log('chat-body-tag-replace.test.ts: all passed');
