import assert from 'node:assert/strict';
import lodash from 'lodash';
import type { ReplicaFamilyCleanupDialogOutcome } from '../ui/mount-cleanup-dialog';
import type { PostProcessTask, ScriptSettings } from './schema';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

const savedVars: Record<string, unknown> = {};
const chatMetadata: Record<string, unknown> = {};

const g = globalThis as Record<string, unknown>;

g.getScriptId = () => '工作流助手';
g.getVariables = (opt: { type?: string; message_id?: number }) => {
  if (opt?.type === 'message') return {};
  return { ...savedVars };
};
g.insertOrAssignVariables = (data: unknown) => {
  Object.assign(savedVars, data as Record<string, unknown>);
};
g.updateVariablesWith = (
  fn: (v: Record<string, unknown>) => Record<string, unknown>,
  opt?: { type?: string },
) => {
  if (opt?.type === 'message') return fn({});
  const next = fn({ ...savedVars });
  for (const key of Object.keys(savedVars)) delete savedVars[key];
  Object.assign(savedVars, next);
  return next;
};
g.getChatMessages = (id: number) =>
  id === 0 ? [{ role: 'assistant', message: 'reply', message_id: 0 }] : [];
g.defineStore = () => () => ({});
g.ref = <T>(v: T) => ({ value: v });
g.watchEffect = () => {};
g.eventEmit = async () => {};
g.window = {
  parent: {
    SillyTavern: {
      getContext: () => ({
        chatMetadata,
        updateChatMetadata: (v: Record<string, unknown>, reset: boolean) => {
          if (reset) {
            for (const key of Object.keys(chatMetadata)) delete chatMetadata[key];
          }
          Object.assign(chatMetadata, v);
        },
        saveChat: async () => {},
      }),
    },
  },
};

function task(overrides: Partial<PostProcessTask>): PostProcessTask {
  return {
    id: 'root',
    name: 'root',
    enabled: true,
    stage: 2,
    syncAsReplicaFamily: true,
    replicaFamilySpec: 'item@id',
    replicaFamilyEnumSpec: 'item@id',
    replicaFamilyScheduleMode: 'manual',
    promptGroups: [],
    extractInjectTags: [],
    ...overrides,
  } as PostProcessTask;
}

function familyTasks(): PostProcessTask[] {
  return [
    task({}),
    task({
      id: 'rep-1',
      name: 'rep 1',
      syncAsReplicaFamily: false,
      replicaFamilyRootId: 'root',
      replicaFamilyAttrValue: '1',
      replicaFamilyLaunched: true,
      replicaFamilySpec: 'item@id',
    }),
    task({
      id: 'rep-2',
      name: 'rep 2',
      syncAsReplicaFamily: false,
      replicaFamilyRootId: 'root',
      replicaFamilyAttrValue: '2',
      replicaFamilyLaunched: false,
      replicaFamilySpec: 'item@id',
    }),
  ];
}

async function main() {
  const { loadSettings, saveSettings } = await import('./../settings');
  const { clearChatTaskScope } = await import('./chat-task-scope');
  const { runReplicaFamilyCleanupIfDue } = await import('./replica-cleanup-run');

  type Scenario = { enabled: boolean; mode: 'auto' | 'manual'; cycleRounds: number };

  async function setup(s: Scenario) {
    for (const key of Object.keys(chatMetadata)) delete chatMetadata[key];
    for (const key of Object.keys(savedVars)) delete savedVars[key];
    await clearChatTaskScope();

    const tasks = familyTasks();
    const seed = loadSettings();
    seed.tasks = tasks;
    seed.activePresetName = seed.presets[0]?.name || '空模板';
    if (seed.presets[0]) seed.presets[0] = { ...seed.presets[0], tasks: [tasks[0]!] };
    seed.replicaFamilyCleanup = {
      ...seed.replicaFamilyCleanup,
      enabled: s.enabled,
      mode: s.mode,
      cycleRounds: s.cycleRounds,
      minActivityTries: 1,
      defaultsMigrated: true,
    };
    saveSettings(seed);

    // 工作流开始时读到的快照：开关取场景值；effective 带着运行时计数
    const base = loadSettings();
    const effective = lodash.cloneDeep(base) as ScriptSettings;
    effective.tasks = tasks;
    effective.replicaFamilyCleanup.roundsSinceCleanup = 0;
    effective.replicaFamilyCleanup.cycleRunCounts = { 'rep-1': 2 };
    effective.replicaFamilyCleanup.cycleOpportunityCounts = { 'rep-1': 2 };
    return { base, effective };
  }

  function setDiskCleanup(patch: Partial<ScriptSettings['replicaFamilyCleanup']>) {
    const live = loadSettings();
    Object.assign(live.replicaFamilyCleanup, patch);
    saveSettings(live);
  }

  function makeDeps(outcome: ReplicaFamilyCleanupDialogOutcome, hooks?: { beforeDialog?: () => void }) {
    const calls = { dialog: 0, paint: 0 };
    return {
      calls,
      deps: {
        showDialog: async () => {
          calls.dialog += 1;
          hooks?.beforeDialog?.();
          return outcome;
        },
        waitForPaint: async () => {
          calls.paint += 1;
        },
      },
    };
  }

  const confirmed: ReplicaFamilyCleanupDialogOutcome = {
    status: 'confirmed',
    keepBySpec: { 'item@id': ['1'] },
    persistManualKeep: true,
  };
  const replicaCount = (s: ScriptSettings) => s.tasks.filter(t => t.replicaFamilyRootId).length;

  {
    // 开关已被关掉（effective 里仍是旧的开启值）：不弹窗，周期清零
    const { base, effective } = await setup({ enabled: true, mode: 'manual', cycleRounds: 1 });
    effective.replicaFamilyCleanup.roundsSinceCleanup = 5;
    setDiskCleanup({ enabled: false });
    const { deps, calls } = makeDeps(confirmed);
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: true });
    assert.equal(effect, undefined);
    assert.equal(calls.dialog, 0);
    assert.equal(effective.replicaFamilyCleanup.enabled, false);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 0);
    assert.equal(replicaCount(effective), 2);
    console.log('ok cleanup run: disabled switch never shows dialog and resets cycle');
  }

  {
    // 未到周期：不弹窗，计数 +1
    const { base, effective } = await setup({ enabled: true, mode: 'manual', cycleRounds: 3 });
    const { deps, calls } = makeDeps(confirmed);
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: true });
    assert.equal(effect, undefined);
    assert.equal(calls.dialog, 0);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 1);
    assert.equal(replicaCount(effective), 2);
    console.log('ok cleanup run: not due ticks the cycle without dialog');
  }

  {
    // 自动模式：到期直接清理，不弹窗
    const { base, effective } = await setup({ enabled: true, mode: 'auto', cycleRounds: 1 });
    const { deps, calls } = makeDeps(confirmed);
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: true });
    assert.ok(effect);
    assert.equal(calls.dialog, 0);
    assert.equal(calls.paint, 0);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 0);
    assert.equal(effective.tasks.some(t => t.id === 'rep-2'), false);
    assert.equal(effective.tasks.some(t => t.id === 'rep-1'), true);
    console.log('ok cleanup run: auto mode cleans without dialog');
  }

  {
    // 手动模式 + 确认：按保留集清理并重置周期
    const { base, effective } = await setup({ enabled: true, mode: 'manual', cycleRounds: 1 });
    const { deps, calls } = makeDeps(confirmed);
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: true });
    assert.ok(effect);
    assert.equal(calls.paint, 1);
    assert.equal(calls.dialog, 1);
    assert.equal(effective.tasks.some(t => t.id === 'rep-2'), false);
    assert.equal(effective.tasks.some(t => t.id === 'rep-1'), true);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 0);
    console.log('ok cleanup run: manual confirmed applies keep set and resets cycle');
  }

  {
    // 手动模式 + 跳过：不清理，周期清零
    const { base, effective } = await setup({ enabled: true, mode: 'manual', cycleRounds: 1 });
    const { deps, calls } = makeDeps({ status: 'skipped' });
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: true });
    assert.equal(effect, undefined);
    assert.equal(calls.dialog, 1);
    assert.equal(replicaCount(effective), 2);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 0);
    console.log('ok cleanup run: manual skipped resets cycle without cleaning');
  }

  for (const status of ['busy', 'empty'] as const) {
    // 已有弹窗 / 无候选：不算跳过，周期不重置
    const { base, effective } = await setup({ enabled: true, mode: 'manual', cycleRounds: 1 });
    const { deps, calls } = makeDeps({ status });
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: true });
    assert.equal(effect, undefined);
    assert.equal(calls.dialog, 1);
    assert.equal(replicaCount(effective), 2);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 1);
    console.log(`ok cleanup run: dialog ${status} keeps cycle count and does not clean`);
  }

  {
    // 等重绘期间开关被关掉：不弹窗
    const { base, effective } = await setup({ enabled: true, mode: 'manual', cycleRounds: 1 });
    const { deps, calls } = makeDeps(confirmed);
    deps.waitForPaint = async () => {
      calls.paint += 1;
      setDiskCleanup({ enabled: false });
    };
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: true });
    assert.equal(effect, undefined);
    assert.equal(calls.dialog, 0);
    assert.equal(replicaCount(effective), 2);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 0);
    console.log('ok cleanup run: switch turned off while waiting for paint skips dialog');
  }

  {
    // 弹窗期间开关被关掉：丢弃确认结果，不清理，周期清零
    const { base, effective } = await setup({ enabled: true, mode: 'manual', cycleRounds: 1 });
    const { deps, calls } = makeDeps(confirmed, {
      beforeDialog: () => setDiskCleanup({ enabled: false }),
    });
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: true });
    assert.equal(effect, undefined);
    assert.equal(calls.dialog, 1);
    assert.equal(replicaCount(effective), 2);
    assert.equal(effective.replicaFamilyCleanup.enabled, false);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 0);
    assert.equal(loadSettings().replicaFamilyCleanup.enabled, false);
    console.log('ok cleanup run: switch turned off during dialog discards the result');
  }

  {
    // 手动重跑（advanceCycle=false）：不累计周期，不弹窗
    const { base, effective } = await setup({ enabled: true, mode: 'manual', cycleRounds: 1 });
    const { deps, calls } = makeDeps(confirmed);
    const effect = await runReplicaFamilyCleanupIfDue(deps, base, effective, 0, [], { advanceCycle: false });
    assert.equal(effect, undefined);
    assert.equal(calls.dialog, 0);
    assert.equal(effective.replicaFamilyCleanup.roundsSinceCleanup, 0);
    console.log('ok cleanup run: advanceCycle=false does not tick or trigger');
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
