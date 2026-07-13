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
