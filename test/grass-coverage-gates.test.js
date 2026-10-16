import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGrassCoverage } from '../scripts/grass-coverage-gates.mjs';

const counters = (missing, capacityLag = 0) => ({ meadowInViewMissingTiles: missing,
  meadowInViewCapacityLagTiles: capacityLag });
const report = () => ({ counters: counters(5, 2), recovery: {
  ready: true, firstReadyMs: 1800, counters: counters(0) } });

test('grass acceptance retains movement gaps and requires complete density within two seconds stopped', () => {
  const gate = evaluateGrassCoverage(report());
  assert.equal(gate.passed, true);
  assert.deepEqual(gate.movementEnd, { missing: 5, capacityLag: 2 });
  assert.deepEqual(gate.recoveryEnd, { missing: 0, capacityLag: 0 });
});

test('fast frames cannot pass with slow recovery, incomplete density, or absent observations', () => {
  for (const mutate of [
    r => { r.recovery.firstReadyMs = 2001; },
    r => { r.recovery.ready = false; },
    r => { r.recovery.counters = counters(1); },
    r => { r.recovery.counters = counters(0, 1); },
    r => { delete r.recovery; },
    r => { delete r.counters; },
  ]) {
    const r = report(); mutate(r);
    assert.equal(evaluateGrassCoverage(r).passed, false);
  }
});
