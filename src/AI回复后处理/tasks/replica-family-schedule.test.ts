import assert from 'node:assert/strict';
import type { PostProcessTask } from './schema';
import {
  buildReplicaFromRoot,
  mergeReplicaFamilyFromRelay,
  prepareStageTasksWithReplicaSync,
  shouldRunReplicaAtRuntime,
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
    apiPresetName: 'primary',
    apiPresetFallbackNames: [],
    plotWorldbookMode: 'inherit',
    contextMode: 'inherit',
    structuredOutputMode: 'off',
    syncAsReplicaFamily: true,
    replicaFamilySpec: 'item@id',
    replicaFamilyScheduleMode: 'auto',
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

test('auto mode runs all replicas regardless of selected', () => {
  const root = baseTask({ replicaFamilyScheduleMode: 'auto' });
  const rep = buildReplicaFromRoot(root, '1', '处理 item', [root], { selected: false, launched: false });
  assert.equal(shouldRunReplicaAtRuntime(rep, root), true);
});

test('manual mode requires selected and launched', () => {
  const root = baseTask({ replicaFamilyScheduleMode: 'manual' });
  const rep = buildReplicaFromRoot(root, '1', '处理 item', [root], { selected: true, launched: false });
  assert.equal(shouldRunReplicaAtRuntime(rep, root), false);
  const launched = { ...rep, replicaFamilyLaunched: true };
  assert.equal(shouldRunReplicaAtRuntime(launched, root), true);
});

test('merge preserves selected orphan when attr disappears from relay', () => {
  const root = baseTask();
  let tasks = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]);
  const rep2 = tasks.find(t => t.replicaFamilyAttrValue === '2')!;
  tasks = tasks.map(t => (t.id === rep2.id ? { ...t, replicaFamilySelected: true } : t));
  tasks = mergeReplicaFamilyFromRelay(root, ['1'], tasks);
  assert.ok(tasks.some(t => t.replicaFamilyAttrValue === '2'));
  assert.ok(!tasks.some(t => t.replicaFamilyAttrValue === '3'));
});

test('merge removes unselected orphan when attr disappears', () => {
  const root = baseTask();
  let tasks = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]);
  tasks = mergeReplicaFamilyFromRelay(root, ['1'], tasks);
  assert.equal(tasks.filter(t => t.replicaFamilyRootId === root.id).length, 1);
});

test('new synced replicas default unselected and unlaunched', () => {
  const root = baseTask();
  const tasks = mergeReplicaFamilyFromRelay(root, ['9'], [root]);
  const rep = tasks.find(t => t.replicaFamilyAttrValue === '9')!;
  assert.equal(rep.replicaFamilySelected, false);
  assert.equal(rep.replicaFamilyLaunched, false);
});

function relayMap(entries: Record<string, string>) {
  return new Map(Object.entries(entries).map(([k, v]) => [k, [v]]));
}

test('prepareStageTasksWithReplicaSync filters manual replicas', () => {
  const root = baseTask({ replicaFamilyScheduleMode: 'manual' });
  let tasks = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]);
  const rep1 = tasks.find(t => t.replicaFamilyAttrValue === '1')!;
  tasks = tasks.map(t => {
    if (t.id === rep1.id) return { ...t, replicaFamilySelected: true, replicaFamilyLaunched: true };
    return t;
  });
  const relay = relayMap({
    'item@id=1': '<item id="1">A</item>',
    'item@id=2': '<item id="2">B</item>',
  });
  const { tasks: runtime } = prepareStageTasksWithReplicaSync([root], tasks, relay);
  assert.equal(runtime.length, 1);
  assert.equal(runtime[0]!.replicaFamilyAttrValue, '1');
});

test('prepareStageTasksWithReplicaSync auto runs all replicas', () => {
  const root = baseTask({ replicaFamilyScheduleMode: 'auto' });
  const tasks = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]);
  const relay = relayMap({
    'item@id=1': '<item id="1">A</item>',
    'item@id=2': '<item id="2">B</item>',
  });
  const { tasks: runtime } = prepareStageTasksWithReplicaSync([root], tasks, relay);
  assert.equal(runtime.length, 2);
});

if (process.exitCode) process.exit(process.exitCode);
