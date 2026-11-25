import assert from 'node:assert/strict';
import test from 'node:test';
import { WaterReflectionResidency, nearestWaterSlots } from '../src/render/reflections/WaterReflectionResidency.js';

const makeSlot = (x, z) => ({ mesh: { visible: true }, hasWaterCoverage: true,
  terrainSlot: { descriptor: { centerWorldX: x, centerWorldZ: z } } });

test('wet residency follows publication, slot reuse and negative canonical coordinates', () => {
  const index = new WaterReflectionResidency(64);
  const a = makeSlot(-80, -10), b = makeSlot(128, 0);
  index.update(a); index.update(b);
  assert.equal(index.hasNearby(-80, 0, 20), true);
  assert.equal(index.hasNearby(0, 0, 20), false);
  a.terrainSlot.descriptor = { centerWorldX: 0, centerWorldZ: 0 };
  index.update(a);
  assert.equal(index.hasNearby(-80, 0, 20), false);
  assert.equal(index.hasNearby(0, 0, 20), true);
  a.mesh.visible = false; index.update(a);
  assert.equal(index.hasNearby(0, 0, 20), false);
  assert.deepEqual([...index.slots], [b]);
  index.clear(); assert.equal(index.cells.size, 0);
});

test('nearest four selection matches stable full sorting', () => {
  const slots = [makeSlot(10, 10), makeSlot(-10, -10), makeSlot(2, 3), makeSlot(8, 0),
    makeSlot(5, 4), makeSlot(50, 0)];
  const d2 = slot => slot.terrainSlot.descriptor.centerWorldX ** 2 + slot.terrainSlot.descriptor.centerWorldZ ** 2;
  assert.deepEqual(nearestWaterSlots(slots, 0, 0, 4), [...slots].sort((a, b) => d2(a) - d2(b)).slice(0, 4));
});
