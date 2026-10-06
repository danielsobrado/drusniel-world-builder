import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstructionSpatialIndex } from '../src/editor/construction/ConstructionSpatialIndex.js';

test('construction spatial index exposes exact local revisions and reusable id queries', () => {
  const index = new ConstructionSpatialIndex({ chunkWorldSize: 10 });
  const near = { minX: 1, minZ: 1, maxX: 4, maxZ: 4 };
  const far = { minX: 101, minZ: 101, maxX: 104, maxZ: 104 };

  index.updateBounds('near', near);
  const nearRevision = index.signatureForBounds(near);
  assert.ok(nearRevision > 0);

  const ids = new Set(['stale']);
  assert.strictEqual(index.idsForBounds(near, 0, ids), ids);
  assert.deepEqual([...ids], ['near']);

  index.updateBounds('far', far);
  assert.equal(
    index.signatureForBounds(near),
    nearRevision,
    'an unrelated construction edit must not invalidate the local window',
  );
  assert.deepEqual([...index.idsForBounds(far, 0, ids)], ['far']);
});
