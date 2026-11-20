import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import { stoneholdVisualGates } from '../scripts/lib/stonehold-visual-gates.mjs';
import { createDenseCliff } from '../src/editor/performance/qa/StoneholdDenseCliff.js';

test('visual gates flag a localized missing foreground while preserving the other checks', async () => {
  const image = async (topLeft, topRight, bottomLeft) => {
    const data = Buffer.alloc(64 * 64 * 3, 130);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const offset = (y * 64 + x) * 3;
        data.fill(y < 32 ? (x < 32 ? topLeft : topRight) : bottomLeft, offset, offset + 3);
      }
    }
    return sharp(data, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
  };
  const hero = await image(225, 65, 130);
  const reflection = await image(225, 65, 205);
  const references = new Map([
    ['hero', hero], ['reflection', reflection], ['empty', await image(130, 130, 130)],
    ['shadowless', await image(225, 130, 130)], ['emptyReflection', await image(130, 130, 100)],
  ]);
  const baseline = await stoneholdVisualGates(references, hero, reflection);
  assert.ok(Object.values(baseline).every(metric => metric.passed));
  const damaged = await stoneholdVisualGates(references, hero, await image(130, 65, 205));
  assert.equal(damaged.reflectorForeground.passed, false);
  assert.equal(damaged.reflectorForeground.worstTile, 1);
  assert.ok(damaged.silhouette.passed && damaged.shadow.passed && damaged.reflectedContent.passed);
});

test('dense cliff has displaced indexed geometry and the three detail levels share its bounds', () => {
  const [dense, near, far] = [512, 160, 48].map(createDenseCliff);
  assert.deepEqual([dense, near, far].map(geometry => geometry.index.count / 3), [523264, 50880, 4512]);
  for (const [geometry, tolerance] of [[near, 0.2], [far, 1.05]]) {
    assert.ok(geometry.boundingBox.min.distanceTo(dense.boundingBox.min) < tolerance);
    assert.ok(geometry.boundingBox.max.distanceTo(dense.boundingBox.max) < tolerance);
  }
  assert.ok(dense.boundingBox.max.x > 13);
});
