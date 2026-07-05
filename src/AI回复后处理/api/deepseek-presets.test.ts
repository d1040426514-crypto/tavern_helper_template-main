import assert from 'node:assert/strict';
import { createEmptyApiPresetDraft } from './api-preset-utils';
import {
  applyDeepSeekStructuredTemplate,
  applyThinkingModeToDraft,
  buildDeepSeekBodyParams,
  readThinkingMode,
  restoreDeepSeekDraftSnapshot,
  snapshotDeepSeekDraftFields,
} from './deepseek-presets';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('one-click template includes thinking disabled', () => {
  const draft = createEmptyApiPresetDraft();
  applyDeepSeekStructuredTemplate(draft, { cotEnabled: false });
  assert.match(draft.bodyParams, /json_object/);
  assert.match(draft.bodyParams, /thinking:\s*\n\s*type:\s*disabled/);
  assert.equal(draft.customPromptPostProcessing, 'strict');
  assert.equal(draft.includeReasoning, false);
});

test('COT enabled sets thinking enabled and includeReasoning', () => {
  const draft = createEmptyApiPresetDraft();
  applyDeepSeekStructuredTemplate(draft, { cotEnabled: true });
  assert.equal(readThinkingMode(draft.bodyParams), 'enabled');
  assert.equal(draft.includeReasoning, true);
  applyThinkingModeToDraft(draft, 'disabled');
  assert.equal(readThinkingMode(draft.bodyParams), 'disabled');
  assert.equal(draft.includeReasoning, false);
});

test('buildDeepSeekBodyParams toggles thinking type', () => {
  assert.match(buildDeepSeekBodyParams(false), /type: disabled/);
  assert.match(buildDeepSeekBodyParams(true), /type: enabled/);
});

test('snapshot and restore round-trip', () => {
  const draft = createEmptyApiPresetDraft();
  draft.bodyParams = 'custom: true';
  draft.excludeBodyParams = 'top_p';
  draft.customPromptPostProcessing = 'none';
  draft.includeReasoning = true;
  draft.reasoningEffort = 'high';
  const snapshot = snapshotDeepSeekDraftFields(draft);
  applyDeepSeekStructuredTemplate(draft, { cotEnabled: false });
  assert.equal(draft.customPromptPostProcessing, 'strict');
  restoreDeepSeekDraftSnapshot(draft, snapshot);
  assert.equal(draft.bodyParams, 'custom: true');
  assert.equal(draft.excludeBodyParams, 'top_p');
  assert.equal(draft.customPromptPostProcessing, 'none');
  assert.equal(draft.includeReasoning, true);
  assert.equal(draft.reasoningEffort, 'high');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
