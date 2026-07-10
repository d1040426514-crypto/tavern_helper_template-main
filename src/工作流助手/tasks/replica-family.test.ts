import assert from 'node:assert/strict';
import lodash from 'lodash';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

import type { PostProcessTask } from './schema';
import {
  applyTaskWorkflowPresetOnTask,
  saveTaskWorkflowPresetOnTask,
} from './task-workflow-preset';
import {
  assertReplicaMemberPatchAllowed,
  expandEnabledTasksForRuntime,
  findReplicaFamilyRootByRef,
  isReplicaFamilyMember,
  isReplicaFamilyRootTemplate,
  listLaunchedReplicaSuffixes,
  mergeReplicaFamilyFromRelay,
  mirrorAllReplicaFamilies,
  resolveReplicaLaunchedPlaceholder,
  scanDynamicAttrPlaceholders,
  substituteDynamicPlaceholder,
  syncReplicaFamily,
  syncReplicaFromRoot,
  validateReplicaFamilyEligibility,
} from './replica-family';
import type { RelayTagMap } from './utils';

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

test('syncReplicaFamily creates replicas with default launched false in auto mode', () => {
  const root = baseTask();
  const all = syncReplicaFamily(root, ['1', '2'], [root]);
  assert.equal(all.filter(t => t.replicaFamilyRootId === 'root-1').length, 2);
  const rep = all.find(t => t.replicaFamilyAttrValue === '2');
  assert.ok(rep?.promptGroups[0]?.content.includes('{{item@id=2}}'));
  assert.equal(rep?.replicaFamilyLaunched, false);
});

test('merge preserves all replicas when relay shrinks', () => {
  const root = baseTask();
  let merged = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]);
  merged = mergeReplicaFamilyFromRelay(root, ['1'], merged.tasks);
  assert.ok(merged.tasks.some(t => t.replicaFamilyAttrValue === '2'));
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

test('syncReplicaFromRoot mirrors workflow fields and preserves identity', () => {
  const root = baseTask({
    stage: 5,
    apiPresetName: 'root-api',
    extractInjectTags: ['item@id', 'result'],
    promptGroups: [{ name: '', role: 'user', content: 'handle {{item@id}} here', enabled: true }],
  });
  const replica = {
    id: 'rep-1',
    name: '处理 item 1',
    enabled: false,
    stage: 2,
    promptGroups: [{ name: '', role: 'user', content: 'stale {{item@id=1}}', enabled: true }],
    extractInjectTags: ['old'],
    mergeStrategy: 'concat' as const,
    maxRetries: 3,
    minLength: 0,
    apiPresetName: 'old-api',
    plotWorldbookMode: 'inherit' as const,
    contextMode: 'inherit' as const,
    structuredOutputMode: 'off' as const,
    replicaFamilyRootId: 'root-1',
    replicaFamilyAttrValue: '1',
    replicaFamilyLaunched: true,
    replicaFamilySpec: 'item@id',
  };
  const synced = syncReplicaFromRoot(replica, root);
  assert.equal(synced.id, 'rep-1');
  assert.equal(synced.name, '处理 item 1');
  assert.equal(synced.stage, 5);
  assert.equal(synced.apiPresetName, 'root-api');
  assert.deepEqual(synced.extractInjectTags, ['item@id', 'result']);
  assert.equal(synced.enabled, false);
  assert.equal(synced.replicaFamilyLaunched, true);
  assert.equal(synced.promptGroups[0]?.content, 'handle {{item@id=1}} here');
});

test('mirrorAllReplicaFamilies syncs orphan replicas when root changes', () => {
  const root = baseTask({ promptGroups: [{ name: '', role: 'user', content: 'v1 {{item@id}}', enabled: true }] });
  let merged = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]);
  merged = mergeReplicaFamilyFromRelay(root, ['1'], merged.tasks);
  const orphan = merged.tasks.find(t => t.replicaFamilyAttrValue === '2')!;
  assert.ok(orphan.promptGroups[0]?.content.includes('v1'));

  const updatedRoot = {
    ...merged.tasks.find(t => t.id === 'root-1')!,
    promptGroups: [{ name: '', role: 'user', content: 'v2 {{item@id}}', enabled: true }],
  };
  const tasks = merged.tasks.map(t => (t.id === 'root-1' ? updatedRoot : t));
  const mirrored = mirrorAllReplicaFamilies(tasks);
  const syncedOrphan = mirrored.find(t => t.id === orphan.id)!;
  assert.equal(syncedOrphan.promptGroups[0]?.content, 'v2 {{item@id=2}}');
});

test('mirrorAllReplicaFamilies keeps unrelated replica families isolated', () => {
  const rootA = baseTask({ id: 'root-a', replicaFamilySpec: 'item@id' });
  const rootB = baseTask({
    id: 'root-b',
    name: 'npc task',
    replicaFamilySpec: 'npc@id',
    promptGroups: [{ name: '', role: 'user', content: 'npc {{npc@id}}', enabled: true }],
    extractInjectTags: ['npc@id'],
  });
  const repA = syncReplicaFromRoot(
    {
      id: 'rep-a',
      name: '处理 item 1',
      enabled: true,
      stage: 2,
      promptGroups: [],
      extractInjectTags: [],
      mergeStrategy: 'concat',
      maxRetries: 3,
      minLength: 0,
      apiPresetName: '',
      plotWorldbookMode: 'inherit',
      contextMode: 'inherit',
      structuredOutputMode: 'off',
      replicaFamilyRootId: 'root-a',
      replicaFamilyAttrValue: '1',
    },
    rootA,
  );
  const repB = syncReplicaFromRoot(
    {
      id: 'rep-b',
      name: 'npc task x',
      enabled: true,
      stage: 2,
      promptGroups: [],
      extractInjectTags: [],
      mergeStrategy: 'concat',
      maxRetries: 3,
      minLength: 0,
      apiPresetName: '',
      plotWorldbookMode: 'inherit',
      contextMode: 'inherit',
      structuredOutputMode: 'off',
      replicaFamilyRootId: 'root-b',
      replicaFamilyAttrValue: 'x',
    },
    rootB,
  );
  const updatedRootA = {
    ...rootA,
    stage: 9,
    promptGroups: [{ name: '', role: 'user', content: 'new {{item@id}}', enabled: true }],
  };
  const mirrored = mirrorAllReplicaFamilies([updatedRootA, rootB, repA, repB]);
  assert.equal(mirrored.find(t => t.id === 'rep-a')?.stage, 9);
  assert.equal(mirrored.find(t => t.id === 'rep-b')?.stage, 2);
  assert.ok(mirrored.find(t => t.id === 'rep-a')?.promptGroups[0]?.content.includes('{{item@id=1}}'));
  assert.ok(mirrored.find(t => t.id === 'rep-b')?.promptGroups[0]?.content.includes('{{npc@id=x}}'));
});

test('apply workflow preset on root then mirror updates replicas', () => {
  const root = baseTask({ apiPresetName: 'api-v1' });
  let tasks = syncReplicaFamily(root, ['1'], [root]);
  const rootIdx = tasks.findIndex(t => t.id === 'root-1');
  tasks[rootIdx] = saveTaskWorkflowPresetOnTask(tasks[rootIdx]!, 'preset-a');
  tasks[rootIdx] = {
    ...tasks[rootIdx]!,
    stage: 9,
    apiPresetName: 'api-v2',
    promptGroups: [{ name: '', role: 'user', content: 'changed {{item@id}}', enabled: true }],
  };
  tasks[rootIdx] = applyTaskWorkflowPresetOnTask(tasks[rootIdx]!, 'preset-a');
  tasks = mirrorAllReplicaFamilies(tasks);
  const replica = tasks.find(t => t.replicaFamilyAttrValue === '1');
  assert.equal(replica?.stage, 2);
  assert.equal(replica?.apiPresetName, 'api-v2');
  assert.equal(replica?.promptGroups[0]?.content, 'do {{item@id=1}}');
});

test('isReplicaFamilyMember identifies replica tasks', () => {
  assert.equal(isReplicaFamilyMember(baseTask()), false);
  assert.equal(
    isReplicaFamilyMember({
      ...baseTask({ syncAsReplicaFamily: false }),
      replicaFamilyRootId: 'root-1',
      replicaFamilyAttrValue: '1',
    }),
    true,
  );
});

test('assertReplicaMemberPatchAllowed blocks workflow fields', () => {
  const member = {
    ...baseTask({ syncAsReplicaFamily: false }),
    id: 'rep-1',
    replicaFamilyRootId: 'root-1',
    replicaFamilyAttrValue: '1',
  };
  assert.throws(
    () => assertReplicaMemberPatchAllowed(member, { stage: 9 }),
    /副本为原本镜像/,
  );
  assert.throws(
    () =>
      assertReplicaMemberPatchAllowed(member, {
        promptGroups: [{ name: '', role: 'user', content: 'x', enabled: true }],
      }),
    /副本为原本镜像/,
  );
  assert.doesNotThrow(() =>
    assertReplicaMemberPatchAllowed(member, { replicaFamilyLaunched: true }),
  );
  assert.doesNotThrow(() => assertReplicaMemberPatchAllowed(member, { enabled: false }));
});

function relayMap(entries: Record<string, string>): RelayTagMap {
  return new Map(Object.entries(entries).map(([k, v]) => [k, [v]]));
}

test('findReplicaFamilyRootByRef by name and member id', () => {
  const root = baseTask({ name: '副本族处理', replicaFamilyBaseName: '副本族处理' });
  const merged = mergeReplicaFamilyFromRelay(root, ['1'], [root]);
  const rep = merged.tasks.find(t => t.replicaFamilyAttrValue === '1')!;
  assert.equal(findReplicaFamilyRootByRef('副本族处理', merged.tasks)?.id, root.id);
  assert.equal(findReplicaFamilyRootByRef(rep.id, merged.tasks)?.id, root.id);
});

test('listLaunchedReplicaSuffixes manual only launched', () => {
  const root = baseTask({
    name: '副本族处理',
    replicaFamilyBaseName: '副本族处理',
    replicaFamilyScheduleMode: 'manual',
  });
  let tasks = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]).tasks;
  const rep1 = tasks.find(t => t.replicaFamilyAttrValue === '1')!;
  const rep2 = tasks.find(t => t.replicaFamilyAttrValue === '2')!;
  tasks = tasks.map(t => {
    if (t.id === rep1.id) return { ...t, replicaFamilyLaunched: true };
    if (t.id === rep2.id) return { ...t, replicaFamilyLaunched: false };
    return t;
  });
  const syncedRoot = tasks.find(t => t.id === root.id)!;
  assert.deepEqual(listLaunchedReplicaSuffixes(syncedRoot, tasks, new Map()), ['1']);
});

test('listLaunchedReplicaSuffixes auto filters by relay enum', () => {
  const root = baseTask({ replicaFamilyScheduleMode: 'auto' });
  const tasks = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]).tasks;
  const syncedRoot = tasks.find(t => t.id === root.id)!;
  const relay = relayMap({ 'item@id=1': '\u0000' });
  assert.deepEqual(listLaunchedReplicaSuffixes(syncedRoot, tasks, relay), ['1']);
});

test('resolveReplicaLaunchedPlaceholder joins with dunhao', () => {
  const root = baseTask({
    name: '副本族处理',
    replicaFamilyBaseName: '副本族处理',
    replicaFamilyScheduleMode: 'manual',
  });
  let tasks = mergeReplicaFamilyFromRelay(root, ['1', '2'], [root]).tasks;
  tasks = tasks.map(t =>
    t.replicaFamilyAttrValue === '1' || t.replicaFamilyAttrValue === '2'
      ? { ...t, replicaFamilyLaunched: true }
      : t,
  );
  assert.equal(
    resolveReplicaLaunchedPlaceholder('副本族处理', tasks, new Map()),
    '1、2',
  );
});

test('resolveReplicaLaunchedPlaceholder returns empty for unknown root', () => {
  assert.equal(resolveReplicaLaunchedPlaceholder('不存在', [], new Map()), '');
});

if (process.exitCode) process.exit(process.exitCode);
