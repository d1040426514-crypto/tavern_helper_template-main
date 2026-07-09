import assert from 'node:assert/strict';
import {
  collectEnumRegistryAttrValues,
  ENUM_REGISTRY_MARKER,
  parseReplicaEnumFromResponse,
  replicaEnumResultToRegistryTags,
} from './replica-enum-parse';
import { prepareStageTasksWithReplicaSync } from './replica-family';
import type { PostProcessTask } from './schema';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('parse single spec JSON block', () => {
  const text = `<ReplicaEnum>{"spec":"npc@id","values":["alice","bob"]}</ReplicaEnum>`;
  const parsed = parseReplicaEnumFromResponse(text);
  assert.deepEqual(parsed.specs['npc@id'], ['alice', 'bob']);
});

test('parse batch enums array', () => {
  const text = `<ReplicaEnum>{"enums":[{"spec":"npc@id","values":["a","b"]},{"spec":"item@id","values":["1","2"]}]}</ReplicaEnum>`;
  const parsed = parseReplicaEnumFromResponse(text);
  assert.deepEqual(parsed.specs['npc@id'], ['a', 'b']);
  assert.deepEqual(parsed.specs['item@id'], ['1', '2']);
});

test('merge multiple ReplicaEnum blocks', () => {
  const text = [
    '<ReplicaEnum>{"spec":"item@id","values":["1"]}</ReplicaEnum>',
    '叙述文字',
    '<ReplicaEnum>{"spec":"item@id","values":["2"]}</ReplicaEnum>',
  ].join('\n');
  const parsed = parseReplicaEnumFromResponse(text);
  assert.deepEqual(parsed.specs['item@id'], ['1', '2']);
});

test('ignore invalid entry block', () => {
  const text = [
    '<ReplicaEnum>{"spec":"","values":["1"]}</ReplicaEnum>',
    '<ReplicaEnum>{}</ReplicaEnum>',
    '<ReplicaEnum>{"spec":"item@id","values":["2"]}</ReplicaEnum>',
  ].join('');
  const parsed = parseReplicaEnumFromResponse(text);
  assert.deepEqual(parsed.specs['item@id'], ['2']);
});

test('replicaEnumResultToRegistryTags uses marker', () => {
  const tags = replicaEnumResultToRegistryTags({ specs: { 'item@id': ['1'] } });
  assert.equal(tags['item@id=1'], ENUM_REGISTRY_MARKER);
});

test('collectEnumRegistryAttrValues ignores non-marker keys', () => {
  const relay = new Map<string, string[]>([
    ['item@id=1', [ENUM_REGISTRY_MARKER]],
    ['item@id=2', ['real content']],
  ]);
  const values = collectEnumRegistryAttrValues(relay, { tagName: 'item', attrName: 'id' });
  assert.deepEqual(values, ['1']);
});

test('prepareStageTasksWithReplicaSync uses registry keys only', () => {
  const root: PostProcessTask = {
    id: 'root-1',
    name: '处理 item',
    enabled: true,
    stage: 2,
    promptGroups: [{ name: '', role: 'user', content: 'do {{item@id}}', enabled: true }],
    extractInjectTags: ['result'],
    mergeStrategy: 'concat',
    maxRetries: 3,
    minLength: 0,
    apiPresetName: '',
    apiPresetFallbackNames: [],
    plotWorldbookMode: 'inherit',
    contextMode: 'inherit',
    structuredOutputMode: 'off',
    syncAsReplicaFamily: true,
    replicaFamilySpec: 'item@id',
    replicaFamilyEnumSpec: 'item@id',
    replicaFamilyScheduleMode: 'auto',
  };
  const registryRelay = new Map<string, string[]>([
    ['item@id=1', [ENUM_REGISTRY_MARKER]],
    ['item@id=2', [ENUM_REGISTRY_MARKER]],
  ]);
  const { tasks: runtimeFromRegistry } = prepareStageTasksWithReplicaSync([root], [root], registryRelay);
  assert.equal(runtimeFromRegistry.length, 2);

  const xmlRelay = new Map<string, string[]>([
    ['item@id=1', ['<item id="1">A</item>']],
    ['item@id=2', ['<item id="2">B</item>']],
  ]);
  const { tasks: runtimeFromXml, skippedRoots } = prepareStageTasksWithReplicaSync([root], [root], xmlRelay);
  assert.equal(runtimeFromXml.length, 0);
  assert.equal(skippedRoots.length, 1);
});

if (process.exitCode) process.exit(process.exitCode);
