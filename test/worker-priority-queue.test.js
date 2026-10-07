import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkerPriorityQueue } from '../src/editor/world/WorkerPriorityQueue.js';

test('heap dispatch stays stable across a large burst, reprioritization and cancellation', () => {
  const queue = new WorkerPriorityQueue();
  const jobs = [];
  for (let id = 1; id <= 4096; id++) {
    const job = { id, priority: (id * 17) % 31 }; jobs.push(job); queue.push(job);
  }
  for (const job of jobs) {
    if (job.id % 7 === 0) queue.remove(job.id);
    else if (job.id % 5 === 0) queue.reprioritize(job, -job.id % 13);
  }
  const expected = jobs.filter(job => job.id % 7 !== 0).sort((a, b) => a.priority - b.priority || a.id - b.id);
  for (const job of expected) assert.equal(queue.shift(), job);
  assert.equal(queue.length, 0); assert.equal(queue.indices.size, 0); assert.equal(queue.shift(), undefined);
});
