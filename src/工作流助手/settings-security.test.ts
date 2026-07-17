import assert from 'node:assert/strict';
import lodash from 'lodash';
import { ScriptSettingsSchema } from './tasks/schema';
import { detectSecretsInImportRaw, redactScriptSettingsForShare } from './settings-security';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

function minimalSettings() {
  return ScriptSettingsSchema.parse({
    tasks: [
      {
        id: 't1',
        name: '任务',
        recommendedModel: 'deepseek-chat',
        taskWorkflowPresets: [
          {
            name: 'wf',
            savedAt: 1,
            snapshot: {
              name: '任务',
              recommendedModel: 'deepseek-reasoner',
            },
          },
        ],
      },
    ],
    apiPresets: [
      {
        name: '主线路',
        apiConfig: {
          url: 'https://api.example.com',
          apiKey: 'secret-key',
          model: 'm',
          requestHeaders: 'Authorization: Bearer tok\nX-Custom: 1',
        },
      },
    ],
    apiConfig: {
      url: 'https://legacy.example.com',
      apiKey: 'legacy-key',
      model: 'legacy',
    },
  });
}

test('redactScriptSettingsForShare clears apiKey but keeps recommendedModel', () => {
  const settings = minimalSettings();
  const redacted = redactScriptSettingsForShare(settings);
  assert.equal(redacted.apiConfig.apiKey, '');
  assert.equal(redacted.apiPresets[0]?.apiConfig.apiKey, '');
  assert.equal(redacted.apiPresets[0]?.apiConfig.url, 'https://api.example.com');
  assert.equal(redacted.apiPresets[0]?.apiConfig.model, 'm');
  assert.equal(redacted.tasks[0]?.recommendedModel, 'deepseek-chat');
  assert.equal(
    redacted.tasks[0]?.taskWorkflowPresets?.[0]?.snapshot.recommendedModel,
    'deepseek-reasoner',
  );
  assert.ok(!redacted.apiPresets[0]?.apiConfig.requestHeaders?.toLowerCase().includes('authorization'));
});

test('detectSecretsInImportRaw finds apiKey in nested object', () => {
  assert.equal(detectSecretsInImportRaw({ apiPresets: [{ apiConfig: { apiKey: 'x' } }] }), true);
  assert.equal(detectSecretsInImportRaw({ tasks: [{ id: 'a', name: 'n' }] }), false);
});

test('redactScriptSettingsForShare strips machine-local worldbook bindings', () => {
  const settings = minimalSettings();
  settings.plotWorldbookConfig = {
    source: 'manual',
    manualSelection: ['写卡'],
    enabledEntries: { 写卡: [1, 2] },
  };
  settings.chatWorldbookWriteRules = [
    {
      id: 'r1',
      targetTag: 'result',
      template: '{{result}}',
      entryName: '',
      bookSource: 'manual',
      manualBookName: '写卡',
      entryType: 'constant',
      keywords: '',
      splitByAttr: false,
      wrapTagName: '',
      placement: { position: 'at_depth_as_system', depth: 2, order: 10000 },
      preventRecursion: true,
    },
  ];
  settings.tasks[0]!.plotWorldbookMode = 'custom';
  settings.tasks[0]!.plotWorldbookConfig = {
    source: 'manual',
    manualSelection: ['写卡'],
    enabledEntries: { 写卡: [9] },
  };
  settings.presets = [
    {
      name: '分享预设',
      tasks: [],
      finalInjectTemplate: '',
      tagVariableInjectTemplate: '',
      chatExtractTags: { user: [], assistant: [] },
      chatBodyTagReplaceRules: [],
      chatWorldbookWriteRules: [
        {
          id: 'r2',
          targetTag: 'result',
          template: '',
          entryName: '',
          bookSource: 'manual',
          manualBookName: '写卡',
          entryType: 'constant',
          keywords: '',
          splitByAttr: false,
          wrapTagName: '',
          placement: { position: 'at_depth_as_system', depth: 2, order: 10000 },
          preventRecursion: true,
        },
      ],
      contextTurnCount: 3,
      contextExtractRules: [],
      contextExcludeRules: [],
      plotWorldbookConfig: {
        source: 'manual',
        manualSelection: ['写卡'],
        enabledEntries: {},
      },
      taskPlotWorldbookOverridesEnabled: false,
      taskContextOverridesEnabled: false,
      memoryRecallRecentCount: 10,
    },
  ];

  const redacted = redactScriptSettingsForShare(settings);
  assert.equal(redacted.plotWorldbookConfig.source, 'character');
  assert.deepEqual(redacted.plotWorldbookConfig.manualSelection, []);
  assert.deepEqual(redacted.plotWorldbookConfig.enabledEntries, {});
  assert.equal(redacted.chatWorldbookWriteRules[0]?.bookSource, 'character');
  assert.equal(redacted.chatWorldbookWriteRules[0]?.manualBookName, '');
  assert.equal(redacted.tasks[0]?.plotWorldbookConfig?.source, 'character');
  assert.deepEqual(redacted.tasks[0]?.plotWorldbookConfig?.manualSelection, []);
  assert.equal(redacted.presets[0]?.plotWorldbookConfig.source, 'character');
  assert.equal(redacted.presets[0]?.chatWorldbookWriteRules[0]?.manualBookName, '');
  // 本机设置未被原地修改
  assert.equal(settings.plotWorldbookConfig.source, 'manual');
  assert.equal(settings.chatWorldbookWriteRules[0]?.manualBookName, '写卡');
});
