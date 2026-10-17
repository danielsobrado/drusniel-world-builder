import assert from 'node:assert/strict';
import test from 'node:test';
import { bakeWaterObstacleField } from '../src/editor/water/WaterObstacleField.js';
const rock = { x: 0, z: 0, height: -1, radius: 2, scale: 1, surfaceData: [0, 1, 0] };
function field(centerX, kind = 3, rocks = [rock]) {
  const pixels = new Uint8Array(17 * 17 * 2);
  const bake = bakeWaterObstacleField({ pixels, size: 17, centerX, centerZ: 0, meters: 16, rocks,
    waterAt: () => ({ kind, coverage: 1, depth: 1, surfaceHeight: 0, flowX: 1, flowZ: 0 }), rockHeight: () => 2 });
  while (!bake.next().done) { /* production resumable producer */ }
  return pixels;
}
test('local rock wakes point downstream and upstream pockets stay on the upstream side', () => {
  const pixels = field(0), sample = (x, channel) => pixels[(8 * 17 + x + 8) * 2 + channel];
  assert.ok(sample(4, 0) > 150); assert.equal(sample(-4, 0), 0);
  assert.ok(sample(-2, 1) > 150); assert.equal(sample(4, 1), 0);
});
test('independent neighboring fields match exactly on their shared edge', () => {
  const a = field(-8), b = field(8);
  for (let z = 0; z < 17; z++) for (let c = 0; c < 2; c++) assert.equal(a[(z * 17 + 16) * 2 + c], b[z * 17 * 2 + c]);
});
test('lake water, missing rocks and wholly submerged rocks do not create river wakes', () => {
  assert.ok(field(0, 2).every(value => value === 0));
  assert.ok(field(0, 3, []).every(value => value === 0));
  assert.ok(field(0, 3, [{ ...rock, height: -10 }]).every(value => value === 0));
});
