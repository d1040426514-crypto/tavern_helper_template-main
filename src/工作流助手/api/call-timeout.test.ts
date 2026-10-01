import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiCallTimeoutError, raceApiCall, resolveApiTimeoutMs } from './call';
import { RunCancelledError } from '../tasks/run-control';
import { PostProcessTaskSchema } from '../tasks/schema';

test('resolveApiTimeoutMs defaults to 300 seconds', () => {
  assert.equal(resolveApiTimeoutMs(undefined), 300_000);
  assert.equal(resolveApiTimeoutMs(Number.NaN), 300_000);
  assert.equal(resolveApiTimeoutMs(0), 300_000);
  assert.equal(resolveApiTimeoutMs(12), 12_000);
});

test('PostProcessTaskSchema defaults apiTimeoutSec to 300', () => {
  const task = PostProcessTaskSchema.parse({ id: 't1' });
  assert.equal(task.apiTimeoutSec, 300);
});

test('raceApiCall timeout is not a user cancel and can stop generateRaw only when asked', async () => {
  const stopped: string[] = [];
  await assert.rejects(
    () =>
      raceApiCall({
        timeoutMs: 20,
        stopOnTimeout: true,
        generationId: 'gen-1',
        stopGeneration: id => {
          stopped.push(id);
        },
        run: () => new Promise(() => undefined),
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiCallTimeoutError);
      assert.equal(error instanceof RunCancelledError, false);
      assert.match(error.message, /API 请求超时/);
      return true;
    },
  );
  assert.deepEqual(stopped, ['gen-1']);
});

test('raceApiCall timeout does not stop generation on the chat completion path', async () => {
  let stopped = 0;
  await assert.rejects(
    () =>
      raceApiCall({
        timeoutMs: 20,
        stopGeneration: () => {
          stopped += 1;
        },
        run: () => new Promise(() => undefined),
      }),
    (error: unknown) => error instanceof ApiCallTimeoutError,
  );
  assert.equal(stopped, 0);
});

test('raceApiCall parent abort stays a cancel', async () => {
  const parent = new AbortController();
  const pending = raceApiCall({
    timeoutMs: 5_000,
    parentSignal: parent.signal,
    stopOnTimeout: true,
    generationId: 'gen-2',
    stopGeneration: () => {
      throw new Error('should not stop on cancel');
    },
    run: () => new Promise(() => undefined),
  });
  parent.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof RunCancelledError);
});

test('raceApiCall returns when the request finishes in time', async () => {
  const value = await raceApiCall({
    timeoutMs: 1_000,
    run: async () => 'ok',
  });
  assert.equal(value, 'ok');
});
