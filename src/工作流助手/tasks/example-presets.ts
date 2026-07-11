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
    chatBodyTagReplaceRules: [],
    chatWorldbookWriteRules: [],
  },
  {
    name: '副本族与动态占位符示例',
    tasks: [
      {
        id: 'example-enum-item',
        name: '枚举 item',
        enabled: true,
        stage: 1,
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
            content:
              '你是工作流助手。根据当前 AI 回复识别物品名称，可先输出简短分析，再输出 <ReplicaEnum> 包裹的 JSON 枚举块。单 spec：{"spec":"item@name","values":["${name 1}","${name 2}"]}；批量：{"enums":[{"spec":"item@name","values":["${name 1}","${name 2}"]},{"spec":"npc@id","values":["a","b"]}]}。可选另输出 <result> 摘要。',
            enabled: true,
          },
          {
            name: '',
            role: 'user',
            content:
              '当前 AI 回复：\n$7\n\n请输出分析（可选）与 <ReplicaEnum>…</ReplicaEnum> 枚举 JSON（values 填真实物品名）。不要再用 XML 标签枚举。',
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
        enabled: true,
        stage: 2,
        extractInjectTags: ['item@name'],
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
              '你是工作流助手。当前实例标识：{{replica:val}}。用户消息给出单个物品实例。请根据该物品输出处理结果，包裹在 <item name="…">…</item> 中，name 属性须与当前实例一致。',
            enabled: true,
          },
          {
            name: '',
            role: 'user',
            content: '当前物品：\n{{item@name}}\n\n请输出对应的 <item name="…">…</item>。',
            enabled: true,
          },
        ],
        plotWorldbookMode: 'inherit',
        contextMode: 'inherit',
        structuredOutputMode: 'off',
        syncAsReplicaFamily: true,
        replicaFamilySpec: 'item@name',
        replicaFamilyEnumSpec: 'item@name',
        replicaFamilyScheduleMode: 'auto',
      },
    ],
    tagVariableInjectTemplate: '{{item@name}}',
    finalInjectTemplate: 'FLOOR_INJECT:{{item@name}}',
    chatExtractTags: { user: [], assistant: [] },
    chatBodyTagReplaceRules: [],
    chatWorldbookWriteRules: [
      {
        id: 'example-wb-item-name',
        targetTag: 'item@name',
        template: '{{item@name}}',
        entryType: 'keyword',
        splitByAttr: true,
        bookSource: 'character',
      },
    ],
    contextTurnCount: 3,
    contextExtractRules: [],
    contextExcludeRules: [],
    plotWorldbookConfig: { source: 'character', manualSelection: [], enabledEntries: {} },
    taskPlotWorldbookOverridesEnabled: false,
    taskContextOverridesEnabled: false,
  },
  {
    name: '正文润色示例',
    tasks: [
      {
        id: 'example-body-polish',
        name: '正文润色',
        enabled: true,
        stage: 1,
        extractInjectTags: ['content'],
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
              '你是文学润色助手。根据待润色正文进行文学化润色，保持剧情与人设一致，不增删关键情节。只输出一个 <content>…</content> 块，不要其他说明文字。',
            enabled: true,
          },
          {
            name: '',
            role: 'user',
            content: '上一用户输入：\n$8\n\n待润色正文：\n$7',
            enabled: true,
          },
        ],
        plotWorldbookMode: 'inherit',
        contextMode: 'inherit',
        structuredOutputMode: 'off',
      },
    ],
    tagVariableInjectTemplate: '',
    finalInjectTemplate: '',
    chatExtractTags: { user: [], assistant: ['content'] },
    chatBodyTagReplaceRules: [
      {
        id: 'example-content-replace',
        targetTag: 'content',
        template: '{{content}}',
      },
    ],
    chatWorldbookWriteRules: [],
    contextTurnCount: 1,
    contextExtractRules: [
      { start: '<tp', end: '</tp>' },
      { start: '<content', end: '</content>' },
    ],
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
