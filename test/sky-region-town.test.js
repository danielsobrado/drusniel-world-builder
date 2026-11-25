import test from 'node:test';
import assert from 'node:assert/strict';
import { drainedRegion } from '../src/editor/stylized/sky/SkyRegionSampler.js';

test('a town lifts the bog air over it, a marsh keeps it', () => {
  const marsh = { weights: { temperate: 0.47, wetland: 0.53 }, personality: {} };
  assert.equal(drainedRegion(marsh, 0), marsh, 'out of town nothing changes');
  const town = drainedRegion(marsh, 1);
  assert.equal(town.weights.wetland, 0);
  assert.equal(town.weights.temperate, 1);
  const edge = drainedRegion(marsh, 0.5);
  assert.ok(Math.abs(edge.weights.wetland - 0.265) < 1e-9);
  assert.ok(Math.abs(edge.weights.temperate + edge.weights.wetland - 1) < 1e-9, 'weights still sum to one');
});
