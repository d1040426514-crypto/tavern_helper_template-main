import assert from 'node:assert/strict';
import { resolveTaskPlotWorldbookConfig } from './plot-worldbook-config';
import type { PlotWorldbookConfig, PostProcessTask, ScriptSettings } from './schema';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

const globalConfig: PlotWorldbookConfig = {
  source: 'manual',
  manualSelection: ['GlobalBook'],
  enabledEntries: { GlobalBook: [1] },
};

const taskConfig: PlotWorldbookConfig = {
  source: 'manual',
  manualSelection: ['TaskBook'],
  enabledEntries: { TaskBook: [2] },
};

const baseSettings = {
  plotWorldbookConfig: globalConfig,
  taskPlotWorldbookOverridesEnabled: true,
} as ScriptSettings;

const baseTask = {
  id: 't1',
  plotWorldbookMode: 'inherit',
} as PostProcessTask;

test('inherit uses global plotWorldbookConfig', () => {
  const resolved = resolveTaskPlotWorldbookConfig(baseTask, baseSettings);
  assert.equal(resolved.manualSelection[0], 'GlobalBook');
});

test('custom uses task plotWorldbookConfig', () => {
  const task = {
    ...baseTask,
    plotWorldbookMode: 'custom',
    plotWorldbookConfig: taskConfig,
  } as PostProcessTask;
  const resolved = resolveTaskPlotWorldbookConfig(task, baseSettings);
  assert.equal(resolved.manualSelection[0], 'TaskBook');
});

test('custom without plotWorldbookConfig falls back to global', () => {
  const task = {
    ...baseTask,
    plotWorldbookMode: 'custom',
  } as PostProcessTask;
  const resolved = resolveTaskPlotWorldbookConfig(task, baseSettings);
  assert.equal(resolved.manualSelection[0], 'GlobalBook');
});

test('overrides disabled forces global even for custom task', () => {
  const task = {
    ...baseTask,
    plotWorldbookMode: 'custom',
    plotWorldbookConfig: taskConfig,
  } as PostProcessTask;
  const resolved = resolveTaskPlotWorldbookConfig(task, {
    ...baseSettings,
    taskPlotWorldbookOverridesEnabled: false,
  });
  assert.equal(resolved.manualSelection[0], 'GlobalBook');
});
