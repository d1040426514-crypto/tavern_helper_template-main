import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskApiRouteConcurrencyPool } from './route-concurrency-pool';

test('distributes 17 concurrent calls across 3 routes with max 5 per route', async () => {
  const pool = new TaskApiRouteConcurrencyPool(['primary', 'fb1', 'fb2'], 5);
  const peakByRoute = new Map<string, number>();
  const completedByRoute = new Map<string, number>();

  const track = (route: string, delta: number) => {
    const peak = peakByRoute.get(route) ?? 0;
    const active = pool.getActiveCount(route);
    peakByRoute.set(route, Math.max(peak, active));
    if (delta > 0) {
      completedByRoute.set(route, (completedByRoute.get(route) ?? 0) + 1);
    }
  };

  let completed = 0;
  const jobs = Array.from({ length: 17 }, (_, i) =>
    pool.run(async route => {
      track(route, 0);
      assert.ok(pool.getActiveCount(route) <= 5, `route ${route} exceeded cap at job ${i}`);
      await new Promise(r => setTimeout(r, 5));
      track(route, 1);
      completed++;
      return route;
    }),
  );

  const results = await Promise.all(jobs);
  assert.equal(completed, 17);
  assert.equal(results.length, 17);

  for (const route of ['primary', 'fb1', 'fb2']) {
    assert.ok((peakByRoute.get(route) ?? 0) <= 5, `peak on ${route} should be <= 5`);
  }
  assert.equal(
    (completedByRoute.get('primary') ?? 0) +
      (completedByRoute.get('fb1') ?? 0) +
      (completedByRoute.get('fb2') ?? 0),
    17,
  );
});

test('single route queues beyond max concurrency', async () => {
  const pool = new TaskApiRouteConcurrencyPool(['only'], 5);
  let inFlight = 0;
  let maxInFlight = 0;

  const jobs = Array.from({ length: 8 }, () =>
    pool.run(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 20));
      inFlight--;
    }),
  );

  await Promise.all(jobs);
  assert.equal(maxInFlight, 5);
});

test('release wakes queued acquirers preferring freed route', async () => {
  const pool = new TaskApiRouteConcurrencyPool(['a', 'b'], 1);

  const holdA = await pool.acquire();
  const holdB = await pool.acquire();
  assert.equal(holdA, 'a');
  assert.equal(holdB, 'b');

  const thirdPromise = pool.acquire();
  let thirdResolved = false;
  void thirdPromise.then(route => {
    thirdResolved = true;
    assert.equal(route, 'a');
  });

  await new Promise(r => setTimeout(r, 10));
  assert.equal(thirdResolved, false);

  pool.release('a');
  const third = await thirdPromise;
  assert.equal(third, 'a');
  pool.release(third);
  pool.release(holdB);
});
