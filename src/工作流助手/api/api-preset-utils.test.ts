import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApiConfig } from '../tasks/schema';
import { apiFormatDisallowsGenerateRawFallback, buildChatCompletionPayload, normalizeStNativeProxyBase } from './api-preset-utils';

function config(partial: Partial<ApiConfig>): ApiConfig {
  return {
    url: 'https://proxy.example/v1/chat/completions',
    apiKey: 'secret',
    model: 'm',
    source: 'openai',
    bodyParams: '',
    excludeBodyParams: '',
    requestHeaders: 'X-Test: 1',
    customPromptPostProcessing: 'none',
    includeReasoning: false,
    reasoningEffort: 'medium',
    customApiFormat: 'openai_compat',
    ...partial,
  };
}

test('openai compatible payload keeps custom source and bearer header', () => {
  const body = buildChatCompletionPayload([{ role: 'user', content: 'hi' }], config({}));
  assert.equal(body.chat_completion_source, 'custom');
  assert.equal(body.custom_api_format, undefined);
  assert.equal(body.proxy_password, '');
  assert.equal(body.reverse_proxy, 'https://proxy.example/v1/chat/completions');
  assert.equal(body.custom_url, 'https://proxy.example/v1/chat/completions');
  assert.match(String(body.custom_include_headers), /Authorization: Bearer secret/);
});

test('openai responses stays on the custom source', () => {
  const body = buildChatCompletionPayload(
    [{ role: 'user', content: 'hi' }],
    config({ customApiFormat: 'openai_responses' }),
  );
  assert.equal(body.chat_completion_source, 'custom');
  assert.equal(body.custom_api_format, undefined);
  assert.equal(body.proxy_password, '');
});

test('claude messages maps source and appends /v1', () => {
  const raw = 'https://api.anthropic.com/v1/messages';
  const body = buildChatCompletionPayload(
    [{ role: 'user', content: 'hi' }],
    config({ url: raw, customApiFormat: 'claude_messages' }),
  );
  assert.equal(body.chat_completion_source, 'claude');
  assert.equal(body.custom_api_format, undefined);
  assert.equal(body.reverse_proxy, 'https://api.anthropic.com/v1');
  assert.equal(body.proxy_password, 'secret');
  assert.equal(body.custom_url, raw);
  assert.match(String(body.custom_include_headers), /Authorization: Bearer secret/);
  assert.equal(normalizeStNativeProxyBase('https://proxy.example', 'claude'), 'https://proxy.example/v1');
});

test('gemini interactions strips version suffix', () => {
  const raw = 'https://generativelanguage.googleapis.com/v1beta';
  const body = buildChatCompletionPayload(
    [{ role: 'user', content: 'hi' }],
    config({ url: raw, customApiFormat: 'gemini_interactions' }),
  );
  assert.equal(body.chat_completion_source, 'makersuite');
  assert.equal(body.custom_api_format, undefined);
  assert.equal(body.reverse_proxy, 'https://generativelanguage.googleapis.com');
  assert.equal(body.proxy_password, 'secret');
  assert.equal(body.custom_url, raw);
});

test('api format blocks generateRaw only for native sources on SillyTavern', () => {
  assert.equal(apiFormatDisallowsGenerateRawFallback('openai_compat', false), false);
  assert.equal(apiFormatDisallowsGenerateRawFallback('openai_responses', false), false);
  assert.equal(apiFormatDisallowsGenerateRawFallback('claude_messages', false), true);
  assert.equal(apiFormatDisallowsGenerateRawFallback('gemini_interactions', false), true);
  assert.equal(apiFormatDisallowsGenerateRawFallback('openai_compat', true), false);
  assert.equal(apiFormatDisallowsGenerateRawFallback('openai_responses', true), true);
  assert.equal(apiFormatDisallowsGenerateRawFallback('claude_messages', true), true);
  assert.equal(apiFormatDisallowsGenerateRawFallback('gemini_interactions', true), true);
});
