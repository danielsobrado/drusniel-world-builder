import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three/webgpu';

import { createSecondaryUvAtlas } from '../src/editor/performance/qa/R187SecondaryUv.js';

test('secondary UV bake preserves original corner UVs and material groups', () => {
  const source = new Mesh(new BoxGeometry(2, 3, 4), new MeshBasicMaterial());
  const original = source.geometry;
  const first = createSecondaryUvAtlas(source, { resolution: 256, padding: 4 });
  const second = createSecondaryUvAtlas(source, { resolution: 256, padding: 4 });
  assert.equal(source.geometry, original);
  assert.equal(original.hasAttribute('uv1'), false);
  assert.deepEqual(first.geometry.groups, original.groups);
  assert.equal(first.geometry.index.count, original.index.count);
  for (let i = 0; i < original.index.count; i += 1) {
    const a = original.index.getX(i), b = first.geometry.index.getX(i);
    assert.equal(first.geometry.attributes.uv.getX(b), original.attributes.uv.getX(a));
    assert.equal(first.geometry.attributes.uv.getY(b), original.attributes.uv.getY(a));
  }
  assert.equal(first.atlas.warnings.excludedFaces, 0);
  assert.deepEqual(first.geometry.attributes.uv1.array, second.geometry.attributes.uv1.array);
  assert.ok(first.geometry.attributes.uv1.array.every(value => value >= 0 && value <= 1));
  first.geometry.dispose(); second.geometry.dispose(); original.dispose(); source.material.dispose();
});
