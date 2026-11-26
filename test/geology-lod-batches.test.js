import assert from 'node:assert/strict';
import test from 'node:test';
import { GeologyLodBatches } from '../src/editor/stylized/lod/GeologyLodBatches.js';
import { createAlpineRockGeometry } from '../src/editor/stylized/alpine/alpineRockGeometry.js';
import { createGlacierSeracGeometry } from '../src/editor/stylized/ice/glacierSeracGeometry.js';
import { createIcebergGeometry } from '../src/editor/stylized/ice/icebergGeometry.js';

test('geology batches preserve kind, use spatial sectors and hysteresis', () => {
  const lod = new GeologyLodBatches({ enabled: true, kinds: 4, cellMeters: 32 });
  const item = { x: 0, z: 0, kind: 2, scale: 2 };
  lod.updateFocus({ x: 0, z: 0 });
  assert.equal(lod.index(item), 2);
  lod.updateFocus({ x: 120, z: 0 });
  const far = lod.index(item);
  assert.ok(lod.isFarBatch(far));
  assert.equal(lod.kind(far), 2);
  lod.updateFocus({ x: 100, z: 0 });
  assert.equal(lod.index(item), far);
  lod.updateFocus({ x: 80, z: 0 });
  assert.equal(lod.index(item), 2);
  assert.notEqual(lod.index({ ...item, x: 300 }), far);
  assert.equal(new GeologyLodBatches({ kinds: 4, cellMeters: 32 }).count, 4);
});

test('far geometry retains required attributes and reduces triangle counts', () => {
  for (const create of [createAlpineRockGeometry, createGlacierSeracGeometry, createIcebergGeometry]) {
    const near = create(0), far = create(0, true);
    try {
      assert.ok(far.index.count < near.index.count);
      assert.deepEqual(Object.keys(far.attributes).sort(), Object.keys(near.attributes).sort());
      assert.ok(far.boundingSphere.radius > 0);
    } finally { near.dispose(); far.dispose(); }
  }
});
