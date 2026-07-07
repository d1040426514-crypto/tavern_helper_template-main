import type { PostProcessPreset } from './schema';

export const BUILTIN_PRESETS: PostProcessPreset[] = [
  {
    name: '空模板',
    tasks: [
      {
        id: 'empty-task',
        name: '空模板任务',
        enabled: true,
        stage: 1,
        extractInjectTags: ['result'],
        promptGroups: [
          {
            role: 'system',
            content: '你是工作流助手。根据上下文输出简短分析，包裹在 <result> 标签内。',
          },
          {
            role: 'user',
            content: '上一用户输入：\n$8\n\n当前 AI 回复：\n$7\n\n请输出 <result>...</result>',
          },
        ],
      },
    ],
    tagVariableInjectTemplate: '<post_process_data>\n{{result}}\n</post_process_data>',
    finalInjectTemplate: '',
    contextTurnCount: 3,
    contextExtractRules: [],
    contextExcludeRules: [],
    plotWorldbookConfig: { source: 'character', manualSelection: [], enabledEntries: {} },
    taskPlotWorldbookOverridesEnabled: false,
    taskContextOverridesEnabled: false,
    chatExtractTags: { user: [], assistant: [] },
  },
  {
    name: '副本族与动态占位符示例',
    tasks: [
      {
        id: 'example-enum-item',
        name: '枚举 item',
        enabled: true,
        stage: 1,
        extractInjectTags: ['item@id'],
        mergeStrategy: 'concat',
        maxRetries: 3,
        minLength: 0,
        apiPresetName: '',
        apiPresetFallbackNames: [],
        apiPrimaryMaxConcurrency: 5,
        apiFallbackMaxConcurrencies: [],
        promptGroups: [
          {
            name: '',
            role: 'system',
            content:
              '你是工作流助手。根据当前 AI 回复，识别其中出现的物品，为每个物品输出一个 <item id="数字">简短描述</item> 块。至少输出 2 个不同 id 的 item（如 id="1" 和 id="2"）。只输出标签块，不要其他文字。',
            enabled: true,
          },
          {
            name: '',
            role: 'user',
            content: '当前 AI 回复：\n$7\n\n请输出多个 <item id="...">...</item>',
            enabled: true,
          },
        ],
        plotWorldbookMode: 'inherit',
        contextMode: 'inherit',
        structuredOutputMode: 'off',
      },
      {
        id: 'example-replica-family',
        name: '副本族处理',
        enabled: false,
        stage: 2,
        extractInjectTags: ['result'],
        mergeStrategy: 'concat',
        maxRetries: 3,
        minLength: 0,
        apiPresetName: '',
        apiPresetFallbackNames: [],
        apiPrimaryMaxConcurrency: 5,
        apiFallbackMaxConcurrencies: [],
        promptGroups: [
          {
            name: '',
            role: 'system',
            content: '针对单个物品输出一行摘要，包裹在 <result> 标签内。',
            enabled: true,
          },
          {
            name: '',
            role: 'user',
            content: '{{item@id}}',
            enabled: true,
          },
        ],
        plotWorldbookMode: 'inherit',
        contextMode: 'inherit',
        structuredOutputMode: 'off',
      },
    ],
    tagVariableInjectTemplate: '{{item@id}}',
    finalInjectTemplate: 'FLOOR_INJECT:{{item@id}}',
    chatExtractTags: { user: [], assistant: [] },
    contextTurnCount: 3,
    contextExtractRules: [],
    contextExcludeRules: [],
    plotWorldbookConfig: { source: 'character', manualSelection: [], enabledEntries: {} },
    taskPlotWorldbookOverridesEnabled: false,
    taskContextOverridesEnabled: false,
  },
];

export function getDefaultSettingsPartial() {
  const preset = BUILTIN_PRESETS[0];
  return {
    tasks: preset.tasks,
    tagVariableInjectTemplate: preset.tagVariableInjectTemplate,
    finalInjectTemplate: preset.finalInjectTemplate,
    contextTurnCount: preset.contextTurnCount,
    contextExtractRules: preset.contextExtractRules,
    contextExcludeRules: preset.contextExcludeRules,
    plotWorldbookConfig: preset.plotWorldbookConfig,
    taskPlotWorldbookOverridesEnabled: preset.taskPlotWorldbookOverridesEnabled ?? false,
    taskContextOverridesEnabled: preset.taskContextOverridesEnabled ?? false,
    presets: BUILTIN_PRESETS,
    activePresetName: preset.name,
  };
}
