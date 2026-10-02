import assert from 'node:assert/strict';
import type { PostProcessTask } from './schema';
import {
  applyTaskWorkflowPresetOnTask,
  applyTaskWorkflowSnapshot,
  buildTaskWorkflowSnapshot,
  createBlankTaskWorkflowPresetOnTask,
  exportTaskWorkflowPresetsJson,
  importTaskWorkflowPresetsFromJson,
  mergeTaskWorkflowPresetsOnTask,
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

test('snapshot includes recommendedModel and apply restores it', () => {
  const task = { ...baseTask(), recommendedModel: 'deepseek-chat' };
  const snap = buildTaskWorkflowSnapshot(task);
  assert.equal(snap.recommendedModel, 'deepseek-chat');

  const target = { ...baseTask(), recommendedModel: '' };
  const applied = applyTaskWorkflowSnapshot(target, snap);
  assert.equal(applied.recommendedModel, 'deepseek-chat');
  assert.equal(applied.apiPresetName, 'my-api');
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

test('export and import round-trip', () => {
  const task = baseTask();
  const saved = saveTaskWorkflowPresetOnTask(task, 'v1');
  const json = exportTaskWorkflowPresetsJson(saved, 'v1');
  const imported = importTaskWorkflowPresetsFromJson(baseTask(), JSON.parse(json));
  assert.equal(imported.taskWorkflowPresets?.length, 1);
  assert.equal(imported.taskWorkflowPresets?.[0]?.name, 'v1');
  assert.equal(imported.taskWorkflowPresets?.[0]?.snapshot.stage, 1);
});

test('merge presets overwrites same name', () => {
  const task = saveTaskWorkflowPresetOnTask(baseTask(), 'v1');
  const entry = task.taskWorkflowPresets![0]!;
  const updated = {
    ...entry,
    snapshot: { ...entry.snapshot, stage: 5 },
  };
  const merged = mergeTaskWorkflowPresetsOnTask(task, [updated]);
  assert.equal(merged.taskWorkflowPresets?.length, 1);
  assert.equal(merged.taskWorkflowPresets?.[0]?.snapshot.stage, 5);
});

test('blank workflow preset resets task fields and keeps API plus schedule', () => {
  const task = {
    ...baseTask(),
    stage: 9,
    replicaFamilySpec: 'item@id',
    promptGroups: [{ name: 'g1', role: 'user' as const, content: '旧内容', enabled: true }],
  };
  const next = createBlankTaskWorkflowPresetOnTask(task, '空白');
  assert.equal(next.id, 'task-1');
  assert.equal(next.name, '测试任务');
  assert.equal(next.stage, 1);
  assert.equal(next.apiPresetName, 'my-api');
  assert.equal(next.replicaFamilyScheduleMode, 'manual');
  assert.equal(next.replicaFamilySpec, undefined);
  assert.equal(next.promptGroups[0]?.content, '当前 AI 回复：$7');
  const preserved = next.taskWorkflowPresets?.find(p => p.name === '未保存配置');
  const blank = next.taskWorkflowPresets?.find(p => p.name === '空白');
  assert.equal(next.taskWorkflowPresets?.length, 2);
  assert.equal(preserved?.snapshot.stage, 9);
  assert.equal(preserved?.snapshot.replicaFamilySpec, 'item@id');
  assert.equal(preserved?.snapshot.promptGroups[0]?.content, '旧内容');
  assert.equal(blank?.snapshot.promptGroups[0]?.content, '当前 AI 回复：$7');
  assert.throws(() => createBlankTaskWorkflowPresetOnTask(next, '空白'), /已存在/);
});

test('blank create skips preserve when current snapshot is already saved', () => {
  const saved = saveTaskWorkflowPresetOnTask(baseTask(), 'v1');
  const next = createBlankTaskWorkflowPresetOnTask(saved, '空白');
  assert.equal(next.taskWorkflowPresets?.some(p => p.name === '未保存配置'), false);
  assert.equal(next.taskWorkflowPresets?.length, 2);
  assert.equal(next.promptGroups[0]?.content, '当前 AI 回复：$7');
});

test('blank create avoids unsaved preset name collisions', () => {
  const occupied = saveTaskWorkflowPresetOnTask(
    {
      ...baseTask(),
      stage: 2,
      promptGroups: [{ name: 'g1', role: 'user', content: '另一份', enabled: true }],
    },
    '未保存配置',
  );
  const edited = {
    ...occupied,
    stage: 8,
    promptGroups: [{ name: 'g1', role: 'user', content: '当前未保存', enabled: true }],
  };
  const next = createBlankTaskWorkflowPresetOnTask(edited, '未保存配置 2');
  const preserved = next.taskWorkflowPresets?.find(p => p.name === '未保存配置 3');
  assert.equal(preserved?.snapshot.promptGroups[0]?.content, '当前未保存');
  assert.equal(next.taskWorkflowPresets?.some(p => p.name === '未保存配置 2'), true);

  const renamed = createBlankTaskWorkflowPresetOnTask(
    {
      ...baseTask(),
      promptGroups: [{ name: 'g1', role: 'user', content: '待保留', enabled: true }],
    },
    '未保存配置',
  );
  assert.equal(renamed.taskWorkflowPresets?.find(p => p.name === '未保存配置 2')?.snapshot.promptGroups[0]?.content, '待保留');
  assert.equal(renamed.taskWorkflowPresets?.find(p => p.name === '未保存配置')?.snapshot.promptGroups[0]?.content, '当前 AI 回复：$7');
});

test('switching preset does not save unsaved workflow', () => {
  const saved = saveTaskWorkflowPresetOnTask(baseTask(), 'v1');
  const edited = {
    ...saved,
    stage: 4,
    replicaFamilySpec: 'item@id',
    replicaFamilyScheduleMode: 'auto' as const,
    apiPresetName: 'kept-api',
    promptGroups: [{ name: 'g1', role: 'user' as const, content: '改过', enabled: true }],
  };
  const applied = applyTaskWorkflowPresetOnTask(edited, 'v1');
  assert.equal(applied.stage, 1);
  assert.equal(applied.promptGroups[0]?.content, 'hello');
  assert.equal(applied.replicaFamilySpec, undefined);
  assert.equal(applied.replicaFamilyScheduleMode, 'auto');
  assert.equal(applied.apiPresetName, 'kept-api');
  assert.equal(applied.taskWorkflowPresets?.some(p => p.name === '未保存配置'), false);
  assert.equal(applied.taskWorkflowPresets?.length, 1);
});

test('switching back to unsaved preset does not create another preset', () => {
  const dirty = {
    ...baseTask(),
    stage: 6,
    replicaFamilySpec: 'item@id',
    replicaFamilyScheduleMode: 'auto' as const,
    apiPresetName: 'kept-api',
    promptGroups: [{ name: 'g1', role: 'user' as const, content: '未保存正文', enabled: true }],
  };
  const created = createBlankTaskWorkflowPresetOnTask(dirty, '空白');
  assert.equal(created.taskWorkflowPresets?.some(p => p.name === '未保存配置'), true);
  const count = created.taskWorkflowPresets?.length ?? 0;

  const back = applyTaskWorkflowPresetOnTask(created, '未保存配置');
  assert.equal(back.taskWorkflowPresets?.length, count);
  assert.equal(back.taskWorkflowPresets?.some(p => p.name === '未保存配置 2'), false);
  assert.equal(back.promptGroups[0]?.content, '未保存正文');
  assert.equal(back.replicaFamilySpec, 'item@id');
  assert.equal(back.replicaFamilyScheduleMode, 'auto');
  assert.equal(back.apiPresetName, 'kept-api');
});

if (process.exitCode) process.exit(process.exitCode);
