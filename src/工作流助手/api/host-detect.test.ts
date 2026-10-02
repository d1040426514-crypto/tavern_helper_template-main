import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApiConfig } from '../tasks/schema';
import { buildChatCompletionPayload } from './api-preset-utils';
import { isTauriTavernHost } from './host-detect';

type FlagHost = {
  __TAURITAVERN__?: unknown;
  window?: { parent?: { __TAURITAVERN__?: unknown } };
};

function config(partial: Partial<ApiConfig>): ApiConfig {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    apiKey: 'secret',
    model: 'm',
    source: 'openai',
    bodyParams: '',
    excludeBodyParams: '',
    requestHeaders: '',
    customPromptPostProcessing: 'none',
    includeReasoning: false,
    reasoningEffort: 'medium',
    customApiFormat: 'claude_messages',
    ...partial,
  };
}

function withHost(flag: unknown, run: () => void): void {
  const root = globalThis as FlagHost;
  const previous = root.__TAURITAVERN__;
  root.__TAURITAVERN__ = flag;
  try {
    run();
  } finally {
    if (previous === undefined) delete root.__TAURITAVERN__;
    else root.__TAURITAVERN__ = previous;
  }
}

test('host is SillyTavern when the flag is absent', () => {
  withHost(undefined, () => {
    assert.equal(isTauriTavernHost(), false);
  });
});

test('host flag on globalThis is TauriTavern', () => {
  withHost(true, () => {
    assert.equal(isTauriTavernHost(), true);
  });
});

test('host flag on the parent window is TauriTavern', () => {
  const root = globalThis as FlagHost;
  const previousWindow = root.window;
  root.window = { parent: { __TAURITAVERN__: true } };
  try {
    assert.equal(isTauriTavernHost(), true);
  } finally {
    root.window = previousWindow;
  }
});

test('TauriTavern keeps the original url and sends custom_api_format', () => {
  withHost(true, () => {
    const raw = 'https://api.anthropic.com/v1/messages';
    const claude = buildChatCompletionPayload([{ role: 'user', content: 'hi' }], config({}));
    assert.equal(claude.chat_completion_source, 'custom');
    assert.equal(claude.custom_api_format, 'claude_messages');
    assert.equal(claude.reverse_proxy, raw);
    assert.equal(claude.proxy_password, '');
    assert.match(String(claude.custom_include_headers), /Authorization: Bearer secret/);

    const responses = buildChatCompletionPayload(
      [{ role: 'user', content: 'hi' }],
      config({ url: 'https://api.example/v1', customApiFormat: 'openai_responses' }),
    );
    assert.equal(responses.chat_completion_source, 'custom');
    assert.equal(responses.custom_api_format, 'openai_responses');
    assert.equal(responses.reverse_proxy, 'https://api.example/v1');
    assert.equal(responses.proxy_password, '');
  });
});
