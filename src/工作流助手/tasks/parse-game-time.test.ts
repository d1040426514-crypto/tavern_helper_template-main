import assert from 'node:assert/strict';
import { formatRemainingDuration, intervalToMs } from './parse-game-time';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('formatRemainingDuration under one minute', () => {
  assert.equal(formatRemainingDuration(0), '不足1分钟');
  assert.equal(formatRemainingDuration(30_000), '不足1分钟');
  assert.equal(formatRemainingDuration(-100), '不足1分钟');
});

test('formatRemainingDuration minutes and hours', () => {
  assert.equal(formatRemainingDuration(intervalToMs(45, 'minute')), '45分钟');
  assert.equal(formatRemainingDuration(intervalToMs(2, 'hour') + intervalToMs(15, 'minute')), '2小时15分钟');
});

test('formatRemainingDuration days and hours max two parts', () => {
  const ms =
    intervalToMs(1, 'day') + intervalToMs(2, 'hour') + intervalToMs(30, 'minute');
  assert.equal(formatRemainingDuration(ms), '1天2小时');
});

if (process.exitCode) process.exit(process.exitCode);
