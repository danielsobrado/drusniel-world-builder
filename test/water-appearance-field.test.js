import assert from 'node:assert/strict';
import test from 'node:test';
import { createWaterField, halfToFloat } from '../src/editor/water/WaterField.js';
import { createWaterAppearanceSampler, seaExposure } from '../src/editor/water/WaterAppearance.js';

test('shoreline field retains the signed bed crossing between wet and dry vertices', () => {
  const field = createWaterField({ originX: 0, originZ: 0, chunkSize: 2,
    sampleWater: x => ({ kind: x < 1 ? 1 : 0, coverage: x < 1 ? 1 : 0,
      surfaceHeight: x < 1 ? 0 : x - .25, bedHeight: x - .25, depth: x < 1 ? .25 - x : 0, shoreDistance: 0 }) });
  const wet = halfToFloat(field.pixels[2]), dry = halfToFloat(field.pixels[6]);
  assert.equal(wet, .25); assert.equal(dry, -.75);
  assert.equal(wet / (wet - dry), .25, 'zero contour follows the physical bank inside the cell');
});

test('water appearance distinguishes sea-level lakes, slow rivers and marine water', () => {
  for (const kind of [1, 2, 3]) {
    const field = createWaterField({ originX: 0, originZ: 0, chunkSize: 1,
      sampleWater: () => ({ kind, coverage: 1, surfaceHeight: 0, bedHeight: -2, depth: 2, shoreDistance: 8, flowX: 0, flowZ: 0 }) });
    assert.equal(field.appearancePixels[0], kind);
  }
});

test('appearance context is continuous across independently generated chunks and negative coordinates', () => {
  const biome = x => x < -64 ? 12 : 9;
  const a = createWaterAppearanceSampler(biome), b = createWaterAppearanceSampler(biome);
  assert.deepEqual(a(-64, 6, 2, 4), b(-64, 6, 2, 4));
  assert.ok(Math.abs(a(-64 - .001, 6, 2, 4).organic - b(-64 + .001, 6, 2, 4).organic) < .001);
  assert.ok(a(-96, 0, 2, 4).organic > .9);
  assert.ok(a(-32, 0, 1, 4).cold > .5);
  assert.equal(seaExposure(0), .3); assert.equal(seaExposure(48), 1);
});
