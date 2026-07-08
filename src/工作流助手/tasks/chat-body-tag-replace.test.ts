import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectStageTagsForRule,
  replaceBareTagLastInner,
  replaceTagInnersInMessage,
} from './chat-body-tag-replace';
import type { TaskRunResult } from './runtime';

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

console.log('chat-body-tag-replace.test.ts: all passed');
