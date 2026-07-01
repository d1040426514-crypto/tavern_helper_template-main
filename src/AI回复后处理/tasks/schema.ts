import { z } from 'zod';
import { normalizePromptRole } from './prompt-role';

export const PromptGroupSchema = z.object({
  role: z.preprocess(
    value => (typeof value === 'string' ? normalizePromptRole(value) : value),
    z.enum(['system', 'user', 'assistant']).default('user'),
  ),
  content: z.string().default(''),
});

export const TimeSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_tag'),
    tagNames: z.array(z.string()).default(['time']),
    scope: z.enum(['current_ai', 'current_pair']).default('current_ai'),
  }),
  z.object({
    type: z.literal('variable'),
    variableType: z.enum(['chat', 'global', 'message', 'script', 'character']).default('chat'),
    path: z.string().default(''),
    message_id: z.number().optional(),
  }),
]);

export const TaskScheduleSchema = z.object({
  /** 调度模式：按回合间隔 或 按游戏时间间隔，二选一；缺省时由 timeInterval.enabled 推断 */
  mode: z.enum(['round', 'time']).optional(),
  roundInterval: z.number().int().min(0).optional(),
  timeInterval: z
    .object({
      enabled: z.boolean().default(false),
      value: z.number().positive().default(1),
      unit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']).default('hour'),
      timeSource: TimeSourceSchema,
      parseFormat: z.string().optional(),
      onParseFail: z.enum(['skip', 'run', 'wall_clock']).default('skip'),
    })
    .optional(),
});

export const PostProcessTaskSchema = z.object({
  id: z.string(),
  name: z.string().default('未命名任务'),
  enabled: z.boolean().default(true),
  stage: z.number().int().min(1).default(1),
  order: z.number().int().default(0),
  promptGroups: z.array(PromptGroupSchema).default([]),
  extractInjectTags: z.array(z.string()).default(['result']),
  mergeStrategy: z.enum(['concat', 'replace', 'first']).default('concat'),
  maxRetries: z.number().int().min(1).default(3),
  minLength: z.number().int().min(0).default(0),
  skipIfTagsFound: z.array(z.string()).optional(),
  apiPresetName: z.string().default(''),
  schedule: TaskScheduleSchema.optional(),
});

export const ApiConfigSchema = z.object({
  url: z.string().default(''),
  apiKey: z.string().default(''),
  model: z.string().default(''),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  source: z.string().default('openai'),
  proxy_preset: z.string().optional(),
  bodyParams: z.string().default(''),
  excludeBodyParams: z.string().default(''),
  requestHeaders: z.string().default(''),
});

export const ApiPresetSchema = z.object({
  name: z.string(),
  apiConfig: ApiConfigSchema,
});

export const ApiPresetBindingSchema = z.object({
  presetName: z.string(),
  updatedAt: z.number(),
});

export const PlotWorldbookConfigSchema = z.object({
  source: z.enum(['character', 'manual']).default('character'),
  manualSelection: z.array(z.string()).default([]),
  enabledEntries: z.record(z.string(), z.array(z.number())).default({}),
});

export const ContextTagRuleSchema = z.object({
  start: z.string().default(''),
  end: z.string().default(''),
});

/** @deprecated 旧版规则，加载时自动迁移为 ContextTagRule */
export const ContextExcludeRuleSchema = z.object({
  tag: z.string(),
  mode: z.enum(['remove', 'extract']).default('remove'),
});

export const RunLogMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().default(''),
});

export const RunLogTaskResultSchema = z.object({
  taskId: z.string(),
  taskName: z.string(),
  stage: z.number().int().optional(),
  skipped: z.boolean().optional(),
  skipReason: z.string().optional(),
  success: z.boolean().optional(),
  preview: z.string().optional(),
  durationMs: z.number().optional(),
  promptMessages: z.array(RunLogMessageSchema).default([]),
  aiOutput: z.string().default(''),
  aiReasoning: z.string().optional().default(''),
});

export const CustomVariableSchema = z.object({
  key: z.string(),
  value: z.string().default(''),
});

export const PostProcessPresetSchema = z.object({
  name: z.string(),
  tasks: z.array(PostProcessTaskSchema).default([]),
  customVariables: z.array(CustomVariableSchema).default([]),
  finalInjectTemplate: z.string().default(''),
  tagVariableInjectTemplate: z.string().default(''),
  contextTurnCount: z.number().int().min(0).default(3),
  contextExtractRules: z.array(ContextTagRuleSchema).default([]),
  contextExcludeRules: z.array(ContextTagRuleSchema).default([]),
  plotWorldbookConfig: PlotWorldbookConfigSchema.default({
    source: 'character',
    manualSelection: [],
    enabledEntries: {},
  }),
});

export const ScheduleStateEntrySchema = z.object({
  lastRunRound: z.number().int().default(0),
  lastRunGameTimeRaw: z.string().optional(),
  lastRunGameTimeMs: z.number().optional(),
  lastRunAt: z.number().optional(),
});

export const ScriptSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    apiConfig: ApiConfigSchema.default({
      url: '',
      apiKey: '',
      model: '',
      source: 'openai',
    }),
    apiPresets: z.array(ApiPresetSchema).default([]),
    defaultApiPresetName: z.string().default(''),
    activeApiPresetName: z.string().default(''),
    apiPresetBindingsByChat: z.record(z.string(), ApiPresetBindingSchema).default({}),
    defaultTaskApiPreset: z.string().default(''),
    taskApiPresetOverridesById: z.record(z.string(), z.string()).default({}),
    tasks: z.array(PostProcessTaskSchema).default([]),
    customVariables: z.array(CustomVariableSchema).default([]),
    contextTurnCount: z.number().int().min(0).default(3),
    contextExtractRules: z.array(ContextTagRuleSchema).default([]),
    contextExcludeRules: z.array(ContextTagRuleSchema).default([]),
    plotWorldbookConfig: PlotWorldbookConfigSchema.default({
      source: 'character',
      manualSelection: [],
      enabledEntries: {},
    }),
    finalInjectTemplate: z.string().default(''),
    tagVariableInjectTemplate: z.string().default(''),
    presets: z.array(PostProcessPresetSchema).default([]),
    activePresetName: z.string().default(''),
    scheduleState: z.record(z.string(), ScheduleStateEntrySchema).default({}),
    lastRunStatus: z
      .object({
        messageId: z.number().optional(),
        at: z.number().optional(),
        taskResults: z.array(RunLogTaskResultSchema).default([]),
      })
      .default({ taskResults: [] }),
    uiThemeId: z.string().default('creamy-minimal'),
  })
  .prefault({});

export type PostProcessTask = z.infer<typeof PostProcessTaskSchema>;
export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type ApiPreset = z.infer<typeof ApiPresetSchema>;
export type ApiPresetBinding = z.infer<typeof ApiPresetBindingSchema>;
export type PlotWorldbookConfig = z.infer<typeof PlotWorldbookConfigSchema>;
export type PostProcessPreset = z.infer<typeof PostProcessPresetSchema>;
export type ScriptSettings = z.infer<typeof ScriptSettingsSchema>;
export type ContextTagRule = z.infer<typeof ContextTagRuleSchema>;
export type RunLogMessage = z.infer<typeof RunLogMessageSchema>;
export type RunLogTaskResult = z.infer<typeof RunLogTaskResultSchema>;
export type ScheduleStateEntry = z.infer<typeof ScheduleStateEntrySchema>;
export type TaskSchedule = z.infer<typeof TaskScheduleSchema>;
