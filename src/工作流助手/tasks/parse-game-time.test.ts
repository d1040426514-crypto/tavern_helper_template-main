import assert from 'node:assert/strict';
import {
  chineseNumeralToInt,
  formatRemainingDuration,
  intervalToMs,
  normalizeGameTimeRaw,
  parseGameTimeToMs,
} from './parse-game-time';

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
  const ms = intervalToMs(1, 'day') + intervalToMs(2, 'hour') + intervalToMs(30, 'minute');
  assert.equal(formatRemainingDuration(ms), '1天2小时');
});

test('chineseNumeralToInt common years', () => {
  assert.equal(chineseNumeralToInt('十'), 10);
  assert.equal(chineseNumeralToInt('十一'), 11);
  assert.equal(chineseNumeralToInt('二十'), 20);
  assert.equal(chineseNumeralToInt('一百'), 100);
  assert.equal(chineseNumeralToInt('二百三十'), 230);
  assert.equal(chineseNumeralToInt('一千'), 1000);
  assert.equal(chineseNumeralToInt('两千'), 2000);
  assert.equal(chineseNumeralToInt('488'), 488);
});

test('normalizeGameTimeRaw strips location and weather', () => {
  assert.equal(
    normalizeGameTimeRaw('复兴纪元488年-5月-14日-15:48 @ 某地| 晴'),
    '复兴纪元488年-5月-14日-15:48',
  );
});

test('parseGameTimeToMs slash calendar with chinese year', () => {
  const a = parseGameTimeToMs('新王国历十年-01/01/10:15');
  const b = parseGameTimeToMs('新王国历10年-01/01/10:15');
  assert.ok(a != null);
  assert.equal(a, b);
});

test('parseGameTimeToMs slash calendar with spaced time', () => {
  const a = parseGameTimeToMs('新王国历十年-01/01 10:15');
  const b = parseGameTimeToMs('新王国历十年-01/01/10:15');
  assert.ok(a != null);
  assert.equal(a, b);
});

test('parseGameTimeToMs dash month-day after year', () => {
  const ms = parseGameTimeToMs('复兴纪元488年-5-14-15:48');
  assert.ok(ms != null);
  assert.equal(ms, parseGameTimeToMs('复兴纪元488年-5月-14日-15:48'));
});

test('parseGameTimeToMs classic chinese calendar still works', () => {
  const ms = parseGameTimeToMs('复兴纪元488年-5月-14日-星期三-15:48');
  assert.ok(ms != null);
});

test('parseGameTimeToMs numeric gregorian still works', () => {
  const ms = parseGameTimeToMs('2026-06-30 15:48');
  assert.ok(ms != null);
  assert.equal(ms, new Date(2026, 5, 30, 15, 48, 0).getTime());
});

if (process.exitCode) process.exit(process.exitCode);
