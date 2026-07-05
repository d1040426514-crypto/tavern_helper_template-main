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
            content: '你是 AI 回复后处理助手。根据上下文输出简短分析，包裹在 <result> 标签内。',
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
    name: '回复质检',
    tasks: [
      {
        id: 'quality-check',
        name: '回复质检',
        enabled: true,
        stage: 1,
        extractInjectTags: ['consistency', 'issues'],
        promptGroups: [
          {
            role: 'system',
            content: '检查 AI 回复是否与用户意图一致。输出 <consistency>一致|部分一致|不一致</consistency> 和 <issues>问题列表或「无」</issues>',
          },
          {
            role: 'user',
            content: '用户输入：$8\n\nAI 回复：$7',
          },
        ],
      },
    ],
    tagVariableInjectTemplate:
      '<consistency_check_data>\n<consistency>{{consistency}}</consistency>\n<issues>{{issues}}</issues>\n</consistency_check_data>',
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
    name: '后续选项生成',
    tasks: [
      {
        id: 'choices-gen',
        name: '选项生成',
        enabled: true,
        stage: 1,
        extractInjectTags: ['choices'],
        schedule: { roundInterval: 0 },
        promptGroups: [
          {
            role: 'system',
            content: '根据当前剧情生成 3 个玩家可选行动，输出在 <choices> 标签内，每行一个选项。',
          },
          {
            role: 'user',
            content: '当前剧情：\n$7',
          },
        ],
      },
    ],
    tagVariableInjectTemplate: '{{choices}}',
    finalInjectTemplate: '',
    contextTurnCount: 2,
    contextExcludeRules: [],
    plotWorldbookConfig: { source: 'character', manualSelection: [], enabledEntries: {} },
    taskPlotWorldbookOverridesEnabled: false,
    taskContextOverridesEnabled: false,
    chatExtractTags: { user: [], assistant: [] },
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
