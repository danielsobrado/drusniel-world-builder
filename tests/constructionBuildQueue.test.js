import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstructionBuildQueue } from '../src/editor/construction/render/ConstructionBuildQueue.js';

function job(constructionId, moduleId, requestedBand) {
  return { constructionId, module: { id: moduleId }, requestedBand };
}

test('construction build queue coalesces the latest request per module', () => {
  const queue = new ConstructionBuildQueue();
  queue.upsert(job('wall:1', 'module:1', 'near'));
  queue.upsert(job('wall:1', 'module:1', 'coarse'));
  assert.equal(queue.length, 1);
  assert.equal(queue.shift().requestedBand, 'coarse');
  assert.equal(queue.length, 0);
});

test('removed construction jobs cannot consume a later requeued request', () => {
  const queue = new ConstructionBuildQueue();
  queue.upsert(job('wall:1', 'module:1', 'near'));
  queue.removeConstruction('wall:1');
  queue.upsert(job('wall:1', 'module:1', 'coarse'));
  assert.equal(queue.shift().requestedBand, 'coarse');
  assert.equal(queue.shift(), undefined);
});

test('construction removal leaves other queued modules intact', () => {
  const queue = new ConstructionBuildQueue();
  queue.upsert(job('wall:1', 'module:1', 'near'));
  queue.upsert(job('wall:2', 'module:1', 'near'));
  queue.removeConstruction('wall:1');
  assert.equal(queue.length, 1);
  assert.equal(queue.some(entry => entry.constructionId === 'wall:2'), true);
  assert.equal(queue.shift().constructionId, 'wall:2');
});
