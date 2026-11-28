import assert from 'node:assert/strict';
import test from 'node:test';
import { createMovementPlan, parseQaParams } from '../src/editor/performance/qa/parseQaParams.js';

test('LOD reversal repeats approach and retreat in one measurement', () => {
  const plan = createMovementPlan(parseQaParams('?qa=lod-reversal&settle=1&duration=20'));
  assert.equal(plan.phases[0].settle, true);
  assert.deepEqual(plan.phases.slice(1).map(phase => phase.keys[0]), ['KeyW', 'KeyS', 'KeyW', 'KeyS']);
  assert.equal(plan.phases.slice(1).reduce((total, phase) => total + phase.durationSeconds, 0), 20);
});

test('LOD revisit returns to canonical origin independent of rebasing', () => {
  const plan = createMovementPlan(parseQaParams('?qa=lod-revisit&originThreshold=6000'));
  assert.equal(plan.phases[2].canonicalOffset.x, 12000);
  assert.deepEqual(plan.phases[3].canonicalOffset, { x: 0, z: 0 });
});
