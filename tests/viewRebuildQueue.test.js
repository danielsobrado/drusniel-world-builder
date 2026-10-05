import assert from 'node:assert/strict';
import test from 'node:test';
import { StylizedBuildQueue } from '../src/editor/stylized/StylizedBuildQueue.js';
import { syncViewRebuildQueue } from '../src/editor/stylized/ViewRebuildQueue.js';
import { stepViewRebuild } from '../src/editor/stylized/StagedViewRebuild.js';
import { ITERATOR_PENDING } from '../src/editor/stylized/ResumableIterator.js';

test('changing LOD requests retain one queued replacement and the unfinished publication', () => {
  const queue = new StylizedBuildQueue({ now: () => 0 });
  const view = { pendingRebuild: { key: 'lod:0', updateKey: '0' } };
  const published = ['previous'];
  let factories = 0;
  const flush = () => queue.flush((job, shouldYield) => stepViewRebuild(
    view, view.pendingRebuild, shouldYield, function* (request) {
      factories++;
      yield ITERATOR_PENDING;
      published.push(request.updateKey);
      return true;
    },
  ));
  syncViewRebuildQueue(queue, [view]);
  flush();
  const staged = view.stagedRebuild;
  for (let index = 1; index <= 100; index++) {
    view.pendingRebuild = { key: `lod:${index}`, updateKey: String(index) };
    syncViewRebuildQueue(queue, [view]);
    assert.equal(queue.size, 1);
    assert.strictEqual(view.stagedRebuild, staged);
    assert.deepEqual(published, ['previous']);
  }
  flush();
  assert.deepEqual(published, ['previous', '0']);
  assert.equal(view.pendingRebuild.updateKey, '100');
  syncViewRebuildQueue(queue, [view]);
  flush();
  syncViewRebuildQueue(queue, [view]);
  flush();
  syncViewRebuildQueue(queue, [view]);
  assert.equal(queue.size, 0);
  assert.equal(view.pendingRebuild, null);
  assert.deepEqual(published, ['previous', '0', '100']);
  assert.equal(factories, 2);
});

test('shared detail queue keeps other views and the age of an unchanged request', () => {
  let now = 10;
  const queue = new StylizedBuildQueue({ now: () => now });
  const first = { pendingRebuild: { key: 'ground:1' } };
  const second = { pendingRebuild: { key: 'shore:1' } };
  syncViewRebuildQueue(queue, [first, second]);
  now = 100;
  second.pendingRebuild = { key: 'shore:2' };
  syncViewRebuildQueue(queue, [first, second]);
  assert.deepEqual(queue.queue.map(job => [job.key, job.requestedAt]),
    [['ground:1', 10], ['shore:2', 100]]);
  first.pendingRebuild = null;
  syncViewRebuildQueue(queue, [first, second]);
  assert.deepEqual(queue.queue.map(job => job.key), ['shore:2']);
});
