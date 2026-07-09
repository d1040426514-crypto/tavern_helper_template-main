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

test('副本族与动态占位符示例 preset configures replica family task', () => {
  const preset = BUILTIN_PRESETS.find(p => p.name === '副本族与动态占位符示例');
  assert.ok(preset, 'preset should exist');

  const enumTask = preset.tasks.find(t => t.id === 'example-enum-item');
  assert.ok(enumTask);
  assert.equal(enumTask.enabled, true);
  assert.equal(enumTask.stage, 1);
  assert.ok(enumTask.promptGroups.some(g => g.content.includes('item@name')));
  assert.ok(enumTask.promptGroups.some(g => g.content.includes('${name 1}')));

  const replicaTask = preset.tasks.find(t => t.id === 'example-replica-family');
  assert.ok(replicaTask);
  assert.equal(replicaTask.enabled, true);
  assert.equal(replicaTask.stage, 2);
  assert.deepEqual(replicaTask.extractInjectTags, ['item@name']);
  assert.equal(replicaTask.syncAsReplicaFamily, true);
  assert.equal(replicaTask.replicaFamilySpec, 'item@name');
  assert.equal(replicaTask.replicaFamilyEnumSpec, 'item@name');
  assert.ok(replicaTask.promptGroups.some(g => g.content.includes('{{item@name}}')));
  assert.ok(replicaTask.promptGroups.some(g => g.content.includes('<item name')));
  assert.equal(preset.tagVariableInjectTemplate, '{{item@name}}');
  assert.equal(preset.finalInjectTemplate, 'FLOOR_INJECT:{{item@name}}');
});

console.log('example-presets.test.ts: all passed');
