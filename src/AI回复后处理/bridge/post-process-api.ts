import {
  addPromptGroup,
  clearChatScope,
  createTask,
  deleteTask,
  duplicateTask,
  getChatScopeState,
  getLastRunStatus,
  getTask,
  listApiPresetNames,
  listTasks,
  movePromptGroup,
  moveTask,
  moveTaskToIndex,
  promoteChatScopeToPreset,
  removePromptGroup,
  renameTask,
  replaceTasks,
  resetTaskScheduleState,
  resolveTaskApiPresetName,
  setTaskEnabled,
  updatePresetFields,
  updatePromptGroup,
  updateTask,
  updateTaskApiPreset,
  updateTaskApiPresetRouting,
  updateTaskContext,
  updateTaskExecutionOptions,
  updateTaskExtractTags,
  updateTaskPlotWorldbook,
  updateTaskSchedule,
  updateTaskStage,
  type PresetFieldsPatch,
  type TaskApiPresetRoutingPatch,
  type TaskExecutionOptionsPatch,
  type TaskSchedulePatch,
  type TaskWriteSource,
} from '../tasks/task-store';
import type { ChatTaskScopeState, PlotWorldbookConfig, PostProcessTask, TaskContextConfig } from '../tasks/schema';
import type { z } from 'zod';
import { PromptGroupSchema } from '../tasks/schema';

type PromptGroup = z.infer<typeof PromptGroupSchema>;

export type { TaskExecutionOptionsPatch, TaskSchedulePatch, TaskApiPresetRoutingPatch } from '../tasks/task-store';

export interface AcuPostProcessTaskAPI {
  listTasks(): PostProcessTask[];
  getTask(id: string): PostProcessTask | null;
  createTask(input?: Partial<PostProcessTask>): Promise<PostProcessTask>;
  updateTask(id: string, patch: Partial<PostProcessTask>): Promise<PostProcessTask>;
  deleteTask(id: string): Promise<boolean>;
  replaceTasks(tasks: PostProcessTask[]): Promise<void>;
  getChatScopeState(): ChatTaskScopeState | null;
  clearChatScope(): Promise<void>;
  promoteChatScopeToPreset(name?: string): Promise<string | null>;
  updatePresetFields(fields: PresetFieldsPatch): Promise<void>;
  updateTaskPlotWorldbook(
    taskId: string,
    input: { mode?: 'inherit' | 'custom'; config?: PlotWorldbookConfig },
  ): Promise<PostProcessTask>;
  updateTaskContext(
    taskId: string,
    input: { mode?: 'inherit' | 'custom'; config?: TaskContextConfig },
  ): Promise<PostProcessTask>;
  updatePromptGroup(taskId: string, index: number, patch: Partial<PromptGroup>): Promise<PostProcessTask>;
  updateTaskStage(taskId: string, stage: number): Promise<PostProcessTask>;
  updateTaskSchedule(taskId: string, patch: TaskSchedulePatch): Promise<PostProcessTask>;
  updateTaskExtractTags(taskId: string, tags: string[]): Promise<PostProcessTask>;
  updateTaskExecutionOptions(taskId: string, patch: TaskExecutionOptionsPatch): Promise<PostProcessTask>;
  updateTaskApiPreset(taskId: string, presetName: string): Promise<PostProcessTask>;
  updateTaskApiPresetRouting(taskId: string, patch: TaskApiPresetRoutingPatch): Promise<PostProcessTask>;
  addPromptGroup(taskId: string, group?: Partial<PromptGroup>): Promise<PostProcessTask>;
  removePromptGroup(taskId: string, index: number): Promise<PostProcessTask>;
  movePromptGroup(taskId: string, index: number, delta: -1 | 1): Promise<PostProcessTask>;
  setTaskEnabled(taskId: string, enabled: boolean): Promise<PostProcessTask>;
  renameTask(taskId: string, name: string): Promise<PostProcessTask>;
  duplicateTask(taskId: string, options?: { afterTaskId?: string }): Promise<PostProcessTask>;
  moveTask(taskId: string, delta: -1 | 1): Promise<void>;
  moveTaskToIndex(taskId: string, toIndex: number): Promise<void>;
  /** 只读：最近一次运行状态（全局，不经聊天快照） */
  getLastRunStatus(): ReturnType<typeof getLastRunStatus>;
  /** 只读：可用 API 预设名称列表 */
  listApiPresets(): string[];
  /** 只读：解析任务最终使用的 API 预设名 */
  resolveTaskApiPresetName(taskId: string): string;
  /** 清除调度运行时状态（全局 scheduleState，非任务定义） */
  resetTaskScheduleState(taskId?: string): Promise<void>;
}

function apiCall<T>(fn: (source: TaskWriteSource) => T | Promise<T>): T | Promise<T> {
  return fn('api');
}

export const acuPostProcessTaskApi: AcuPostProcessTaskAPI = {
  listTasks: () => listTasks(),
  getTask: (id: string) => getTask(id),
  createTask: (input?: Partial<PostProcessTask>) => apiCall(() => createTask(input, 'api')) as Promise<PostProcessTask>,
  updateTask: (id: string, patch: Partial<PostProcessTask>) =>
    apiCall(() => updateTask(id, patch, 'api')) as Promise<PostProcessTask>,
  deleteTask: (id: string) => apiCall(() => deleteTask(id, 'api')) as Promise<boolean>,
  replaceTasks: (tasks: PostProcessTask[]) => apiCall(() => replaceTasks(tasks, 'api')) as Promise<void>,
  getChatScopeState: () => getChatScopeState(),
  clearChatScope: () => apiCall(() => clearChatScope('api')) as Promise<void>,
  promoteChatScopeToPreset: (name?: string) =>
    apiCall(() => promoteChatScopeToPreset(name)) as Promise<string | null>,
  updatePresetFields: (fields: PresetFieldsPatch) =>
    apiCall(() => updatePresetFields(fields, 'api')) as Promise<void>,
  updateTaskPlotWorldbook: (taskId, input) =>
    apiCall(() => updateTaskPlotWorldbook(taskId, input, 'api')) as Promise<PostProcessTask>,
  updateTaskContext: (taskId, input) =>
    apiCall(() => updateTaskContext(taskId, input, 'api')) as Promise<PostProcessTask>,
  updatePromptGroup: (taskId, index, patch) =>
    apiCall(() => updatePromptGroup(taskId, index, patch, 'api')) as Promise<PostProcessTask>,
  updateTaskStage: (taskId, stage) =>
    apiCall(() => updateTaskStage(taskId, stage, 'api')) as Promise<PostProcessTask>,
  updateTaskSchedule: (taskId, patch) =>
    apiCall(() => updateTaskSchedule(taskId, patch, 'api')) as Promise<PostProcessTask>,
  updateTaskExtractTags: (taskId, tags) =>
    apiCall(() => updateTaskExtractTags(taskId, tags, 'api')) as Promise<PostProcessTask>,
  updateTaskExecutionOptions: (taskId, patch) =>
    apiCall(() => updateTaskExecutionOptions(taskId, patch, 'api')) as Promise<PostProcessTask>,
  updateTaskApiPreset: (taskId, presetName) =>
    apiCall(() => updateTaskApiPreset(taskId, presetName, 'api')) as Promise<PostProcessTask>,
  updateTaskApiPresetRouting: (taskId, patch) =>
    apiCall(() => updateTaskApiPresetRouting(taskId, patch, 'api')) as Promise<PostProcessTask>,
  addPromptGroup: (taskId, group) =>
    apiCall(() => addPromptGroup(taskId, group, 'api')) as Promise<PostProcessTask>,
  removePromptGroup: (taskId, index) =>
    apiCall(() => removePromptGroup(taskId, index, 'api')) as Promise<PostProcessTask>,
  movePromptGroup: (taskId, index, delta) =>
    apiCall(() => movePromptGroup(taskId, index, delta, 'api')) as Promise<PostProcessTask>,
  setTaskEnabled: (taskId, enabled) =>
    apiCall(() => setTaskEnabled(taskId, enabled, 'api')) as Promise<PostProcessTask>,
  renameTask: (taskId, name) => apiCall(() => renameTask(taskId, name, 'api')) as Promise<PostProcessTask>,
  duplicateTask: (taskId, options) =>
    apiCall(() => duplicateTask(taskId, options, 'api')) as Promise<PostProcessTask>,
  moveTask: (taskId, delta) => apiCall(() => moveTask(taskId, delta, 'api')) as Promise<void>,
  moveTaskToIndex: (taskId, toIndex) =>
    apiCall(() => moveTaskToIndex(taskId, toIndex, 'api')) as Promise<void>,
  getLastRunStatus: () => getLastRunStatus(),
  listApiPresets: () => listApiPresetNames(),
  resolveTaskApiPresetName: (taskId: string) => resolveTaskApiPresetName(taskId),
  resetTaskScheduleState: (taskId?: string) =>
    apiCall(() => resetTaskScheduleState(taskId, 'api')) as Promise<void>,
};

export function mountAcuPostProcessAPI(): void {
  try {
    (window.parent as Window & { AcuPostProcessAPI?: AcuPostProcessTaskAPI }).AcuPostProcessAPI =
      acuPostProcessTaskApi;
  } catch (error) {
    console.warn('[AI回复后处理] 挂载 AcuPostProcessAPI 失败:', error);
  }
  (window as unknown as Record<string, unknown>).__acuPpTaskApi = acuPostProcessTaskApi;
}
