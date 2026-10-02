import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSecretsFromSettings } from '../settings/api-secrets';
import type { PostProcessTask, ScriptSettings } from '../tasks/schema';
import { rewriteApiPresetReferences } from './api-preset-references';

function task(id: string, apiPresetName: string, fallbacks: string[] = []): PostProcessTask {
  return {
    id,
    apiPresetName,
    apiPresetFallbackNames: fallbacks,
  } as PostProcessTask;
}

function settings(): ScriptSettings {
  return {
    tasks: [task('live', '旧'), task('member', '别的', ['旧', '备用'])],
    presets: [{ name: '工作流', tasks: [task('catalog', '旧')] }],
    taskApiPresetOverridesById: { live: '旧', other: '备用' },
    defaultApiPresetName: '旧',
    defaultTaskApiPreset: '备用',
    activeApiPresetName: '旧',
    apiPresetBindingsByChat: {
      chatA: { presetName: '旧', updatedAt: 1 },
      chatB: { presetName: '备用', updatedAt: 2 },
    },
    apiPresets: [
      {
        name: '新',
        apiConfig: { url: 'https://api.example', apiKey: 'secret-key', model: 'm', source: 'openai' },
      },
    ],
    apiConfig: { url: '', apiKey: '', model: '', source: 'openai' },
  } as ScriptSettings;
}

test('rename updates task, catalog, override, binding, and secret key', () => {
  const current = settings();
  rewriteApiPresetReferences(current, '旧', '新');
  assert.equal(current.tasks[0]?.apiPresetName, '新');
  assert.equal(current.tasks[1]?.apiPresetName, '别的');
  assert.deepEqual(current.tasks[1]?.apiPresetFallbackNames, ['新', '备用']);
  assert.equal(current.presets[0]?.tasks[0]?.apiPresetName, '新');
  assert.equal(current.taskApiPresetOverridesById.live, '新');
  assert.equal(current.taskApiPresetOverridesById.other, '备用');
  assert.equal(current.defaultApiPresetName, '新');
  assert.equal(current.defaultTaskApiPreset, '备用');
  assert.equal(current.activeApiPresetName, '新');
  assert.equal(current.apiPresetBindingsByChat.chatA?.presetName, '新');
  assert.equal(current.apiPresetBindingsByChat.chatB?.presetName, '备用');
  assert.equal(extractSecretsFromSettings(current).byPreset['新']?.apiKey, 'secret-key');
  assert.equal(extractSecretsFromSettings(current).byPreset['旧'], undefined);
});

test('delete clears references and drops the secret key', () => {
  const current = settings();
  current.apiPresets = [];
  rewriteApiPresetReferences(current, '旧', '');
  assert.equal(current.tasks[0]?.apiPresetName, '');
  assert.deepEqual(current.tasks[1]?.apiPresetFallbackNames, ['备用']);
  assert.equal(current.presets[0]?.tasks[0]?.apiPresetName, '');
  assert.equal(current.taskApiPresetOverridesById.live, undefined);
  assert.equal(current.defaultApiPresetName, '');
  assert.equal(current.defaultTaskApiPreset, '备用');
  assert.equal(current.apiPresetBindingsByChat.chatA, undefined);
  assert.equal(extractSecretsFromSettings(current).byPreset['旧'], undefined);
  assert.equal(extractSecretsFromSettings(current).byPreset['新'], undefined);
});
