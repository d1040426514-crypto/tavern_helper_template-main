import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PostProcessTask } from './schema';
import {
  applyReplicaStateToTasks,
  buildReplicaStateFromTasks,
  mergeReplicaStateSnapshots,
  normalizeReplicaStateSnapshot,
} from './replica-state';

function rootTask(overrides: Partial<PostProcessTask> = {}): PostProcessTask {
  return {
    id: 'root',
    name: '物品',
    enabled: true,
    stage: 1,
    promptGroups: [],
    syncAsReplicaFamily: true,
    replicaFamilySpec: 'item@name',
    replicaFamilyBaseName: '物品',
    replicaFamilyScheduleMode: 'auto',
    ...overrides,
  } as PostProcessTask;
}

function memberTask(attrValue: string, overrides: Partial<PostProcessTask> = {}): PostProcessTask {
  return {
    id: `member-${attrValue}`,
    name: `物品 ${attrValue}`,
    enabled: true,
    stage: 1,
    promptGroups: [],
    replicaFamilyRootId: 'root',
    replicaFamilyAttrValue: attrValue,
    replicaFamilySpec: 'item@name',
    ...overrides,
  } as PostProcessTask;
}

test('buildReplicaStateFromTasks collects attrValues and launched', () => {
  const tasks = [
    rootTask({ replicaFamilyScheduleMode: 'manual' }),
    memberTask('剑', { replicaFamilyLaunched: true }),
    memberTask('盾', { replicaFamilyLaunched: false }),
  ];
  const snap = buildReplicaStateFromTasks(tasks);
  assert.deepEqual(snap.root?.attrValues, ['剑', '盾']);
  assert.deepEqual(snap.root?.launchedAttrValues, ['剑']);
});

test('buildReplicaStateFromTasks omits launched list when none launched', () => {
  const tasks = [rootTask(), memberTask('剑'), memberTask('盾')];
  const snap = buildReplicaStateFromTasks(tasks);
  assert.equal(snap.root?.launchedAttrValues, undefined);
});

test('mergeReplicaStateSnapshots later overrides earlier per root', () => {
  const merged = mergeReplicaStateSnapshots([
    { root: { attrValues: ['剑'] } },
    { root: { attrValues: ['剑', '盾'] } },
    { other: { attrValues: ['甲'] } },
  ]);
  assert.deepEqual(merged.root?.attrValues, ['剑', '盾']);
  assert.deepEqual(merged.other?.attrValues, ['甲']);
});

test('applyReplicaStateToTasks removes members absent from snapshot', () => {
  const tasks = [rootTask(), memberTask('剑'), memberTask('盾')];
  const next = applyReplicaStateToTasks(tasks, { root: { attrValues: ['剑'] } });
  const members = next.filter(t => t.replicaFamilyRootId === 'root');
  assert.deepEqual(
    members.map(m => m.replicaFamilyAttrValue),
    ['剑'],
  );
});

test('applyReplicaStateToTasks adds missing members from snapshot', () => {
  const tasks = [rootTask(), memberTask('剑')];
  const next = applyReplicaStateToTasks(tasks, { root: { attrValues: ['剑', '盾'] } });
  const attrs = next
    .filter(t => t.replicaFamilyRootId === 'root')
    .map(m => m.replicaFamilyAttrValue)
    .sort();
  assert.deepEqual(attrs, ['剑', '盾']);
});

test('applyReplicaStateToTasks empty snapshot clears all members', () => {
  const tasks = [rootTask(), memberTask('剑'), memberTask('盾')];
  const next = applyReplicaStateToTasks(tasks, {});
  assert.equal(next.filter(t => t.replicaFamilyRootId === 'root').length, 0);
});

test('applyReplicaStateToTasks restores launched flags in manual mode', () => {
  const tasks = [
    rootTask({ replicaFamilyScheduleMode: 'manual' }),
    memberTask('剑', { replicaFamilyLaunched: false }),
  ];
  const next = applyReplicaStateToTasks(tasks, {
    root: { attrValues: ['剑'], launchedAttrValues: ['剑'] },
  });
  const member = next.find(t => t.replicaFamilyAttrValue === '剑');
  assert.equal(member?.replicaFamilyLaunched, true);
});

test('normalizeReplicaStateSnapshot drops invalid entries', () => {
  const snap = normalizeReplicaStateSnapshot({
    root: { attrValues: ['剑'] },
    bad: { notAttr: 1 },
    nope: 'x',
  });
  assert.ok(snap);
  assert.deepEqual(Object.keys(snap!), ['root']);
});

test('normalizeReplicaStateSnapshot returns null for non-object', () => {
  assert.equal(normalizeReplicaStateSnapshot(null), null);
  assert.equal(normalizeReplicaStateSnapshot([1, 2]), null);
});

console.log('replica-state.test.ts: all passed');
