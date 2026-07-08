import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILTIN_PRESETS } from './example-presets';
import { PostProcessPresetSchema } from './schema';

test('all builtin presets parse with PostProcessPresetSchema', () => {
  for (const preset of BUILTIN_PRESETS) {
    const parsed = PostProcessPresetSchema.parse(preset);
    assert.equal(parsed.name, preset.name);
  }
});

test('正文润色示例 preset has content extract and body replace rule', () => {
  const preset = BUILTIN_PRESETS.find(p => p.name === '正文润色示例');
  assert.ok(preset, 'preset should exist');

  assert.deepEqual(preset.chatExtractTags?.assistant, ['content']);
  assert.equal(preset.chatBodyTagReplaceRules?.length, 1);
  assert.equal(preset.chatBodyTagReplaceRules?.[0]?.targetTag, 'content');
  assert.equal(preset.chatBodyTagReplaceRules?.[0]?.template, '{{content}}');

  const task = preset.tasks.find(t => t.name === '正文润色');
  assert.ok(task);
  assert.deepEqual(task.extractInjectTags, ['content']);
  assert.equal(task.stage, 1);
});

console.log('example-presets.test.ts: all passed');
