import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskApiRouteConcurrencyPool } from './route-concurrency-pool';
import { callTaskApiWithRouteFallback, nextRouteCursor } from './task-api-route';
import type { ScriptSettings } from '../tasks/schema';

function poolLimits(entries: Array<[string, number]>) {
  return new Map(entries);
}

function baseSettings(): ScriptSettings {
  return {
    enabled: true,
    apiConfig: { url: '', apiKey: '', model: '', source: 'openai' },
    apiPresets: [
      { name: 'primary', apiConfig: { url: 'p', apiKey: '', model: 'm', source: 'openai' } },
      { name: 'fallback', apiConfig: { url: 'f', apiKey: '', model: 'm', source: 'openai' } },
    ],
    defaultApiPresetName: 'primary',
    activeApiPresetName: '',
    defaultTaskApiPreset: 'primary',
    taskApiPresetOverridesById: {},
    tasks: [],
    contextTurnCount: 3,
    contextExtractRules: [],
    contextExcludeRules: [],
    plotWorldbookConfig: { source: 'character', manualSelection: [], enabledEntries: {} },
    taskPlotWorldbookOverridesEnabled: false,
    taskContextOverridesEnabled: false,
    finalInjectTemplate: '',
    tagVariableInjectTemplate: '',
    chatExtractTags: { user: [], assistant: [] },
    chatBodyTagReplaceRules: [],
    chatWorldbookWriteRules: [],
    presets: [],
    activePresetName: '',
    scheduleState: {},
    lastRunStatus: { taskResults: [] },
    messageVarRetention: { enabled: true, keepFloors: 20 },
    uiThemeId: 'creamy-minimal',
    apiPresetBindingsByChat: {},
  } as ScriptSettings;
}

test('callTaskApiWithRouteFallback uses fallback when primary throws', async () => {
  const calls: string[] = [];
  const result = await callTaskApiWithRouteFallback(
    [{ role: 'user', content: 'hi', name: '' }],
    baseSettings(),
    ['primary', 'fallback'],
    null,
    'test',
    {
      callApi: async (_messages, resolved) => {
        const url = resolved.apiConfig.url;
        calls.push(url);
        if (url === 'p') throw new Error('primary failed');
        return { content: 'ok-from-fallback' };
      },
    },
  );
  assert.deepEqual(calls, ['p', 'f']);
  assert.equal(result.content, 'ok-from-fallback');
  assert.equal(result.usedPresetName, 'fallback');
});

test('callTaskApiWithRouteFallback throws when all routes fail', async () => {
  await assert.rejects(
    () =>
      callTaskApiWithRouteFallback(
        [{ role: 'user', content: 'hi', name: '' }],
        baseSettings(),
        ['primary', 'fallback'],
        null,
        'test',
        {
          callApi: async () => {
            throw new Error('api down');
          },
        },
      ),
    /api down/,
  );
});

test('callTaskApiWithRouteFallback returns primary when it succeeds', async () => {
  const result = await callTaskApiWithRouteFallback(
    [{ role: 'user', content: 'hi', name: '' }],
    baseSettings(),
    ['primary', 'fallback'],
    null,
    'test',
    {
      callApi: async (_messages, resolved) => ({
        content: `ok:${resolved.apiConfig.url}`,
      }),
    },
  );
  assert.equal(result.content, 'ok:p');
  assert.equal(result.usedPresetName, 'primary');
});

test('callTaskApiWithRouteFallback with pool uses fallback when primary slots are full', async () => {
  const pool = new TaskApiRouteConcurrencyPool(
    ['primary', 'fallback'],
    poolLimits([
      ['primary', 1],
      ['fallback', 1],
    ]),
  );
  const heldPrimary = await pool.acquire();
  assert.equal(heldPrimary, 'primary');

  const calls: string[] = [];
  const result = await callTaskApiWithRouteFallback(
    [{ role: 'user', content: 'hi', name: '' }],
    baseSettings(),
    ['primary', 'fallback'],
    null,
    'test-pool',
    {
      routePool: pool,
      callApi: async (_messages, resolved) => {
        calls.push(resolved.apiConfig.url);
        return { content: 'ok' };
      },
    },
  );

  pool.release(heldPrimary);
  assert.equal(result.usedPresetName, 'fallback');
  assert.deepEqual(calls, ['f']);
});

test('nextRouteCursor advances after a soft failure and resets after a hard failure', () => {
  const chain = ['3f', '3.8f', 'ds3'];
  assert.equal(nextRouteCursor(chain, { soft: true, usedPresetName: '3f' }), 1);
  assert.equal(nextRouteCursor(chain, { soft: true, usedPresetName: '3.8f' }), 2);
  assert.equal(nextRouteCursor(chain, { soft: true, usedPresetName: 'ds3' }), 0);
  assert.equal(nextRouteCursor(chain, { soft: false, usedPresetName: '3.8f' }), 0);
  assert.equal(nextRouteCursor(['only'], { soft: true, usedPresetName: 'only' }), 0);
});

test('callTaskApiWithRouteFallback startIndex calls that preset when it returns', async () => {
  const calls: string[] = [];
  const result = await callTaskApiWithRouteFallback(
    [{ role: 'user', content: 'hi', name: '' }],
    baseSettings(),
    ['primary', 'fallback'],
    null,
    'test-start',
    {
      startIndex: 1,
      callApi: async (_messages, resolved) => {
        calls.push(resolved.apiConfig.url);
        return { content: 'ok-fallback' };
      },
    },
  );
  assert.deepEqual(calls, ['f']);
  assert.equal(result.usedPresetName, 'fallback');
});

test('callTaskApiWithRouteFallback startIndex failover does not wrap back to primary', async () => {
  const settings = baseSettings();
  settings.apiPresets.push({
    name: 'fallback-b',
    apiConfig: { url: 'fb', apiKey: '', model: 'm', source: 'openai' },
  });
  const calls: string[] = [];
  const result = await callTaskApiWithRouteFallback(
    [{ role: 'user', content: 'hi', name: '' }],
    settings,
    ['primary', 'fallback', 'fallback-b'],
    null,
    'test-start-throw',
    {
      startIndex: 1,
      callApi: async (_messages, resolved) => {
        calls.push(resolved.apiConfig.url);
        if (resolved.apiConfig.url === 'f') throw new Error('fallback failed');
        return { content: 'ok-from-b' };
      },
    },
  );
  assert.deepEqual(calls, ['f', 'fb']);
  assert.equal(result.usedPresetName, 'fallback-b');
});

test('callTaskApiWithRouteFallback startIndex with pool does not take a free primary slot', async () => {
  const pool = new TaskApiRouteConcurrencyPool(
    ['primary', 'fallback'],
    poolLimits([
      ['primary', 1],
      ['fallback', 1],
    ]),
  );
  const heldFallback = await pool.acquire({ preferredRoute: 'fallback', allowedRoutes: ['fallback'] });
  assert.equal(heldFallback, 'fallback');

  const calls: string[] = [];
  let started = false;
  const pending = callTaskApiWithRouteFallback(
    [{ role: 'user', content: 'hi', name: '' }],
    baseSettings(),
    ['primary', 'fallback'],
    null,
    'test-start-pool',
    {
      routePool: pool,
      startIndex: 1,
      callApi: async (_messages, resolved) => {
        started = true;
        calls.push(resolved.apiConfig.url);
        return { content: 'ok-fallback' };
      },
    },
  );

  await new Promise(r => setTimeout(r, 20));
  assert.equal(started, false);
  assert.equal(pool.getActiveCount('primary'), 0);

  pool.release(heldFallback);
  const result = await pending;
  assert.equal(result.usedPresetName, 'fallback');
  assert.deepEqual(calls, ['f']);
});
