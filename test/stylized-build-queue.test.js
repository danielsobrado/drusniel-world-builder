import assert from 'node:assert/strict';
import test from 'node:test';
import { StylizedBuildQueue } from '../src/editor/stylized/StylizedBuildQueue.js';

test('StylizedBuildQueue exposes the live budget to a running job', () => {
  let now = 0;
  const queue = new StylizedBuildQueue({
    buildsPerFrame: 4,
    budgetMs: 3,
    now: () => now,
  });
  queue.enqueue({ key: 'first', priority: 0 });
  queue.enqueue({ key: 'second', priority: 1 });

  const visited = [];
  const result = queue.flush((job, shouldYield) => {
    visited.push(job.key);
    now = 4;
    assert.equal(shouldYield(), true);
    return true;
  });

  assert.deepEqual(visited, ['first']);
  assert.deepEqual(result, { built: 1, remaining: 1 });
});

test('StylizedBuildQueue remains compatible with one-argument jobs', () => {
  const queue = new StylizedBuildQueue({
    buildsPerFrame: 2,
    budgetMs: 3,
    now: () => 0,
  });
  queue.enqueue({ key: 'job' });

  let visited = false;
  const result = queue.flush((job) => {
    visited = job.key === 'job';
    return true;
  });

  assert.equal(visited, true);
  assert.deepEqual(result, { built: 1, remaining: 0 });
});

test('StylizedBuildQueue keeps FIFO order for default infinite priorities', () => {
  const queue = new StylizedBuildQueue({
    buildsPerFrame: 2,
    budgetMs: 3,
    now: () => 0,
  });
  queue.enqueue({ key: 'first' });
  queue.enqueue({ key: 'second' });

  const visited = [];
  queue.flush((job) => {
    visited.push(job.key);
    return true;
  });

  assert.deepEqual(visited, ['first', 'second']);
});

test('a blocked nearest manifest cannot spend the single turn needed by a ready neighbour', () => {
  const queue = new StylizedBuildQueue({ buildsPerFrame: 1, budgetMs: 3, now: () => 0 });
  queue.enqueue({ key: 'waiting', priority: 0 });
  queue.enqueue({ key: 'ready', priority: 1 });
  queue.enqueue({ key: 'later', priority: 2 });
  const visited = [];
  const result = queue.flush(job => {
    visited.push(job.key);
    return job.key === 'waiting'
      ? { completed: false, advanced: false, blocked: true, reason: 'rock-manifest' } : true;
  });
  assert.deepEqual(visited, ['waiting', 'ready']);
  assert.deepEqual(result, { built: 1, remaining: 2 });
  assert.equal(queue.getDiagnostics().blocked, 1);
});

test('blocked scans still obey the time budget and never retry within the same flush', () => {
  let now = 0;
  const queue = new StylizedBuildQueue({ buildsPerFrame: 1, budgetMs: 1, now: () => now });
  for (let i = 0; i < 10; i++) queue.enqueue({ key: `waiting-${i}`, priority: i });
  const visited = [];
  queue.flush(job => {
    visited.push(job.key); now += .6;
    return { completed: false, advanced: false, blocked: true, reason: 'prepared-field' };
  });
  assert.equal(visited.length, 2);
  assert.equal(new Set(visited).size, visited.length);
  assert.equal(queue.size, 10);
});
