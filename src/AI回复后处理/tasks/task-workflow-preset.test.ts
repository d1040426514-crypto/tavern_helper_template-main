import assert from 'node:assert/strict';
import type { PostProcessTask } from './schema';
import {
  applyTaskWorkflowPresetOnTask,
  buildTaskWorkflowSnapshot,
  saveTaskWorkflowPresetOnTask,
} from './task-workflow-preset';

function baseTask(): PostProcessTask {
  return {
    id: 'task-1',
    name: '测试任务',
    enabled: true,
    stage: 1,
    promptGroups: [{ name: 'g1', role: 'user', content: 'hello', enabled: true }],
    extractInjectTags: ['result'],
    mergeStrategy: 'concat',
    maxRetries: 3,
    minLength: 0,
    apiPresetName: 'my-api',
    apiPresetFallbackNames: ['fb1'],
    apiPrimaryMaxConcurrency: 2,
    apiFallbackMaxConcurrencies: [1],
    plotWorldbookMode: 'inherit',
    contextMode: 'inherit',
    structuredOutputMode: 'off',
    replicaFamilyScheduleMode: 'manual',
    taskWorkflowPresets: [],
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

test('snapshot excludes API fields, identity and replica schedule', () => {
  const task = baseTask();
  const snap = buildTaskWorkflowSnapshot(task);
  assert.equal((snap as Record<string, unknown>).apiPresetName, undefined);
  assert.equal((snap as Record<string, unknown>).id, undefined);
  assert.equal((snap as Record<string, unknown>).taskWorkflowPresets, undefined);
  assert.equal((snap as Record<string, unknown>).replicaFamilyScheduleMode, undefined);
  assert.equal(snap.promptGroups?.[0]?.content, 'hello');
});

test('apply preset keeps API fields, id and replica schedule mode', () => {
  const task = baseTask();
  const saved = saveTaskWorkflowPresetOnTask(task, 'v1');
  const modified = {
    ...saved,
    stage: 9,
    replicaFamilyScheduleMode: 'auto' as const,
    apiPresetName: 'changed-api',
    promptGroups: [{ name: 'g1', role: 'user', content: 'changed', enabled: true }],
  };
  const restored = applyTaskWorkflowPresetOnTask(modified, 'v1');
  assert.equal(restored.id, 'task-1');
  assert.equal(restored.apiPresetName, 'changed-api');
  assert.equal(restored.apiPresetFallbackNames?.[0], 'fb1');
  assert.equal(restored.apiPrimaryMaxConcurrency, 2);
  assert.equal(restored.stage, 1);
  assert.equal(restored.replicaFamilyScheduleMode, 'auto');
  assert.equal(restored.promptGroups?.[0]?.content, 'hello');
});

if (process.exitCode) process.exit(process.exitCode);
