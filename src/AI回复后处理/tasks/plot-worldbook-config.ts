import type { PlotWorldbookConfig, PostProcessTask, ScriptSettings } from './schema';

export function resolveTaskPlotWorldbookConfig(
  task: PostProcessTask,
  settings: ScriptSettings,
): PlotWorldbookConfig {
  if (!settings.taskPlotWorldbookOverridesEnabled) {
    return settings.plotWorldbookConfig;
  }
  if (task.plotWorldbookMode === 'custom' && task.plotWorldbookConfig) {
    return task.plotWorldbookConfig;
  }
  return settings.plotWorldbookConfig;
}
