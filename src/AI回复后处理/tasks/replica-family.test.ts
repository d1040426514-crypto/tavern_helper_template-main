import assert from 'node:assert/strict';
import type { PostProcessTask } from './schema';
import {
  expandEnabledTasksForRuntime,
  isReplicaFamilyRootTemplate,
  scanDynamicAttrPlaceholders,
  substituteDynamicPlaceholder,
  syncReplicaFamily,
  validateReplicaFamilyEligibility,
} from './replica-family';

function baseTask(overrides: Partial<PostProcessTask> = {}): PostProcessTask {
  return {
    id: 'root-1',
    name: '处理 item',
    enabled: true,
    stage: 2,
    promptGroups: [{ name: '', role: 'user', content: 'do {{item@id}}', enabled: true }],
    extractInjectTags: ['item@id'],
    mergeStrategy: 'concat',
    maxRetries: 3,
    minLength: 0,
    apiPresetName: '',
    plotWorldbookMode: 'inherit',
    contextMode: 'inherit',
    structuredOutputMode: 'off',
    syncAsReplicaFamily: true,
    replicaFamilySpec: 'item@id',
    ...overrides,
  };
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('validate single dynamic spec', () => {
  const r = validateReplicaFamilyEligibility(baseTask());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.spec, 'item@id');
});

test('validate rejects multiple dynamic specs', () => {
  const r = validateReplicaFamilyEligibility(
    baseTask({
      promptGroups: [{ name: '', role: 'user', content: '{{item@id}}{{npc@name}}', enabled: true }],
    }),
  );
  assert.equal(r.ok, false);
});

test('substitute dynamic to precise', () => {
  const out = substituteDynamicPlaceholder('x {{item@id}} y', 'item@id', '2');
  assert.equal(out, 'x {{item@id=2}} y');
});

test('syncReplicaFamily creates replicas with default schedule flags', () => {
  const root = baseTask();
  const all = syncReplicaFamily(root, ['1', '2'], [root]);
  assert.equal(all.filter(t => t.replicaFamilyRootId === 'root-1').length, 2);
  const rep = all.find(t => t.replicaFamilyAttrValue === '2');
  assert.ok(rep?.promptGroups[0]?.content.includes('{{item@id=2}}'));
  assert.equal(rep?.replicaFamilySelected, false);
  assert.equal(rep?.replicaFamilyLaunched, false);
});

test('merge sync preserves selected replica when relay shrinks', () => {
  const root = baseTask();
  let all = syncReplicaFamily(root, ['1', '2'], [root]);
  const rep2 = all.find(t => t.replicaFamilyAttrValue === '2')!;
  all = all.map(t => (t.id === rep2.id ? { ...t, replicaFamilySelected: true } : t));
  all = syncReplicaFamily(root, ['1'], all);
  assert.ok(all.some(t => t.replicaFamilyAttrValue === '2'));
});

test('expandEnabledTasksForRuntime skips root template', () => {
  const root = baseTask();
  const rep = syncReplicaFamily(root, ['1'], [root]).find(t => t.replicaFamilyRootId === 'root-1')!;
  const expanded = expandEnabledTasksForRuntime([root, rep]);
  assert.equal(expanded.length, 1);
  assert.equal(expanded[0]!.id, rep.id);
});

test('isReplicaFamilyRootTemplate', () => {
  assert.equal(isReplicaFamilyRootTemplate(baseTask()), true);
  assert.equal(isReplicaFamilyRootTemplate(baseTask({ syncAsReplicaFamily: false })), false);
});

test('scanDynamicAttrPlaceholders', () => {
  assert.deepEqual(scanDynamicAttrPlaceholders(baseTask()), ['item@id']);
});

if (process.exitCode) process.exit(process.exitCode);
