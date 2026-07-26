import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldWriteRuntimeTasksToGlobal } from './persist-runtime-tasks-logic';

test('shouldWriteRuntimeTasksToGlobal is false when chat override active', () => {
  assert.equal(shouldWriteRuntimeTasksToGlobal(true), false);
  assert.equal(shouldWriteRuntimeTasksToGlobal(false), true);
});
