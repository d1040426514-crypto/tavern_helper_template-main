import assert from 'node:assert/strict';
import { buildChatCompletionPayload } from '../api/api-preset-utils';
import {
  bodyParamsHasResponseFormat,
  enrichApiConfigForStructuredTask,
  extractStrictVariableResponse,
  stripCodeFence,
  tryParseJsonObject,
} from './strict-variable-response';
import type { ApiConfig } from './schema';

const JSON_PATCH_RE = /<JSONPatch>\s*[\s\S]*?\s*<\/JSONPatch>/i;
const ADDON_JSON_PATCH_RE = /<AddonJSONPatch>\s*[\s\S]*?\s*<\/AddonJSONPatch>/i;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('stripCodeFence removes markdown fence', () => {
  const raw = '```json\n{"analysis":"x","patch":[]}\n```';
  assert.equal(stripCodeFence(raw), '{"analysis":"x","patch":[]}');
});

test('tryParseJsonObject extracts object from noise', () => {
  const parsed = tryParseJsonObject('说明文字 {"a":1} 尾部') as { a: number };
  assert.equal(parsed.a, 1);
});

test('mvu strict JSON normalizes to UpdateVariable + JSONPatch', () => {
  const json = JSON.stringify({
    analysis: 'Time passed 1 day.',
    patch: [{ op: 'replace', path: '/x', value: 1 }],
  });
  const result = extractStrictVariableResponse(json, 'mvu_json_patch');
  assert.ok(result.ok);
  assert.match(result.normalizedXml!, /<UpdateVariable>/);
  assert.match(result.normalizedXml!, /<Analysis>Time passed 1 day\.<\/Analysis>/);
  assert.match(result.normalizedXml!, /<JSONPatch>/);
  assert.match(result.normalizedXml!, JSON_PATCH_RE);
});

test('addon strict JSON normalizes to UpdateVariable + AddonJSONPatch', () => {
  const json = JSON.stringify({
    analysis: 'Minor updates only.',
    patch: [{ op: 'replace', path: '/世界时局与经济简报/x', value: 'y' }],
  });
  const result = extractStrictVariableResponse(json, 'addon_json_patch');
  assert.ok(result.ok);
  assert.match(result.normalizedXml!, /<UpdateVariable>/);
  assert.match(result.normalizedXml!, /<AddonJSONPatch>/);
  assert.match(result.normalizedXml!, ADDON_JSON_PATCH_RE);
  assert.ok(!/<UpdateAddonVariable>/i.test(result.normalizedXml!));
});

test('legacy format field is ignored when present', () => {
  const json = JSON.stringify({
    format: 'addon_json_patch_v1',
    analysis: 'Legacy reply with format.',
    patch: [{ op: 'replace', path: '/x', value: 1 }],
  });
  const result = extractStrictVariableResponse(json, 'mvu_json_patch');
  assert.ok(result.ok);
  assert.match(result.normalizedXml!, /<JSONPatch>/);
});

test('missing analysis fails validation', () => {
  const json = JSON.stringify({
    patch: [],
  });
  const result = extractStrictVariableResponse(json, 'mvu_json_patch');
  assert.equal(result.ok, false);
  assert.match(result.error!, /analysis/);
});

test('missing patch fails validation', () => {
  const json = JSON.stringify({
    analysis: 'ok',
  });
  const result = extractStrictVariableResponse(json, 'mvu_json_patch');
  assert.equal(result.ok, false);
  assert.match(result.error!, /patch/);
});

test('enrichApiConfig injects json_object only when missing', () => {
  const base: ApiConfig = {
    url: 'https://api.example.com',
    apiKey: '',
    model: 'deepseek-chat',
    source: 'openai',
    bodyParams: '',
    excludeBodyParams: '',
    requestHeaders: '',
    customPromptPostProcessing: 'none',
    includeReasoning: false,
    reasoningEffort: 'medium',
  };
  const enriched = enrichApiConfigForStructuredTask(base, 'mvu_json_patch');
  assert.ok(bodyParamsHasResponseFormat(enriched.bodyParams));
  assert.equal(enriched.customPromptPostProcessing, 'strict');

  const presetWithFormat: ApiConfig = {
    ...base,
    bodyParams: 'response_format:\n  type: json_schema',
  };
  const kept = enrichApiConfigForStructuredTask(presetWithFormat, 'mvu_json_patch');
  assert.equal(kept.bodyParams, presetWithFormat.bodyParams);
});

test('buildChatCompletionPayload uses preset strict processing', () => {
  const apiConfig: ApiConfig = {
    url: 'https://api.example.com',
    apiKey: 'k',
    model: 'm',
    source: 'openai',
    bodyParams: 'response_format:\n  type: json_object',
    excludeBodyParams: 'top_p',
    requestHeaders: '',
    customPromptPostProcessing: 'strict',
    includeReasoning: false,
    reasoningEffort: 'high',
  };
  const body = buildChatCompletionPayload([{ role: 'user', content: 'hi' }], apiConfig);
  assert.equal(body.custom_prompt_post_processing, 'strict');
  assert.equal(body.reasoning_effort, 'high');
  assert.equal(body.include_reasoning, false);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
