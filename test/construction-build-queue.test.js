import assert from 'node:assert/strict';
import test from 'node:test';

import { ConstructionBuildQueue } from '../src/editor/construction/render/ConstructionBuildQueue.js';

function job(id, priority) {
  return { constructionId: 'wall', module: { id }, requestedBand: 'near', priority };
}

test('construction build queue prioritizes visible work and keeps one current job per module', () => {
  const queue = new ConstructionBuildQueue();
  queue.upsert(job('far', 100));
  queue.upsert(job('near', 1));
  queue.upsert({ ...job('far', 5), requestedBand: 'coarse' });

  assert.equal(queue.length, 2);
  assert.equal(queue.shift().module.id, 'near');
  const replaced = queue.shift();
  assert.equal(replaced.module.id, 'far');
  assert.equal(replaced.requestedBand, 'coarse');
  assert.equal(queue.length, 0);
});
