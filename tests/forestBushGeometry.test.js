import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createBushPrototypeGeometry,
  createForestBushPrototypeGeometry,
  FOREST_BUSH_PROTOTYPES,
} from '../src/editor/stylized/forest/ForestBushGeometry.js';

test('default bush prototypes are grounded multi-stem shrubs with bounded geometry cost', () => {
  assert.deepEqual(FOREST_BUSH_PROTOTYPES, [
    'bush_dome',
    'bush_dome_small',
    'bush_dome_wide',
  ]);

  const prototypes = createForestBushPrototypeGeometry();
  try {
    assert.equal(prototypes.length, 3);
    for (const prototype of prototypes) {
      const positions = prototype.geometry.getAttribute('position');
      const colors = prototype.geometry.getAttribute('color');
      assert.ok(Math.abs(prototype.geometry.boundingBox.min.y) < 1e-6);
      assert.ok(prototype.width > prototype.height);
      assert.ok(positions.count >= 1_000, 'Branched clusters should create a leafy silhouette.');
      assert.ok(positions.count <= 3_600, 'Bush instances must stay within the near-LOD budget.');
      assert.equal(colors.count, positions.count);
      assert.equal(prototype.doubleSided, false);
    }
  } finally {
    for (const prototype of prototypes) prototype.geometry.dispose();
  }
});

test('bush vertex shading separates dark internal branches from upper leaf groupings', () => {
  const [prototype] = createForestBushPrototypeGeometry(['bush_dome']);
  try {
    const colors = prototype.geometry.getAttribute('color');
    const values = Array.from(colors.array);
    assert.ok(Math.min(...values) < 0.58, 'Internal woody branches must stay darker than foliage.');
    assert.ok(Math.max(...values) > 1.05);

    const size = prototype.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x / size.y > 1.25, 'The main bush should spread wider than tall without forming a sphere.');

    // Verify leaf height spread: not all foliage concentrated at a single dome cap.
    const positions = prototype.geometry.getAttribute('position');
    let lowCount = 0;
    let highCount = 0;
    for (let i = 0; i < positions.count; i += 1) {
      const h = positions.getY(i) / size.y;
      if (h > 0.15 && h < 0.45) lowCount += 1;
      if (h > 0.75) highCount += 1;
    }
    assert.ok(lowCount > 100 && highCount > 80, 'Branches and clusters should occupy distinct heights.');
  } finally {
    prototype.geometry.dispose();
  }
});

test('fern_tuft uses naturally arched multi-segment fronds with progressive pinnae taper', () => {
  const fern = createBushPrototypeGeometry('fern_tuft');
  try {
    const positions = fern.geometry.getAttribute('position');
    assert.ok(Math.abs(fern.geometry.boundingBox.min.y) < 1e-5);
    assert.ok(fern.width > fern.height, 'Arching fern fronds should spread wider than tall.');
    assert.ok(positions.count >= 120, 'Fern fronds need segmented arching pinnae rather than flat wedges.');
    assert.equal(fern.doubleSided, true);
  } finally {
    fern.geometry.dispose();
  }
});
