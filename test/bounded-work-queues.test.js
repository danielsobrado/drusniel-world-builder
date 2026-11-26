import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkPriorityHeap } from '../src/editor/performance/WorkPriorityHeap.js';
import { TerrainCommitQueue } from '../src/editor/world/TerrainCommitQueue.js';
import { StylizedBuildQueue } from '../src/editor/stylized/StylizedBuildQueue.js';
import { createIteratorBuilder } from '../src/editor/stylized/ResumableIterator.js';

test('heap updates and removals preserve stable priority order', () => {
  const heap = new WorkPriorityHeap();
  const jobs = Array.from({ length: 1000 }, (_, i) => ({ queuePriority: i % 7, queueSequence: i }));
  for (const job of jobs) heap.push(job);
  jobs[999].queuePriority = -1; heap.changed(jobs[999]);
  assert.equal(heap.pop(), jobs[999]);
  heap.remove(jobs[0]);
  const expected = jobs.slice(1, 999).sort((a, b) => a.queuePriority - b.queuePriority || a.queueSequence - b.queueSequence);
  assert.deepEqual(expected.map(() => heap.pop()), expected);
  assert.equal(heap.indices.size, 0);
});

test('terrain stale job scanning has a fixed work limit but drain completes', () => {
  const queue = new TerrainCommitQueue({ now: () => 0 });
  for (let i = 0; i < 200; i++) queue.enqueue({ slot: { slotIndex: i }, page: {}, priority: i, enqueuedAt: 0 });
  let inspected = 0;
  const result = queue.flush(() => assert.fail(), () => { inspected++; return false; });
  assert.equal(inspected, 64); assert.equal(result.remaining, 136);
  queue.drain(() => assert.fail(), () => false);
  assert.equal(queue.size, 0);
});

test('scenery no-op scans and iterator steps are bounded even with a static clock', () => {
  const queue = new StylizedBuildQueue({ now: () => 0 });
  for (let i = 0; i < 200; i++) queue.enqueue({ key: i, priority: i });
  let inspected = 0;
  queue.flush(() => { inspected++; return false; });
  assert.equal(inspected, 64);
  const builder = createIteratorBuilder(function* () { for (let i = 0; i < 200; i++) yield; return 'done'; });
  assert.equal(builder.step({ shouldYield: () => false }), null);
  assert.equal(builder.progress, 64);
  while (!builder.done) builder.step({ shouldYield: () => false });
  assert.equal(builder.step(), 'done');
});
