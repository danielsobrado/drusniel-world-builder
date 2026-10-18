import assert from 'node:assert/strict';
import test from 'node:test';
import { PerfQaHarness } from '../src/editor/performance/qa/PerfQaHarness.js';
import { parseQaParams } from '../src/editor/performance/qa/parseQaParams.js';

test('QA restart preserves its canonical destination after an intervening floating-origin shift', () => {
  let origin = { x: 0, z: 0 };
  const poses = [], enters = [];
  const harness = new PerfQaHarness({
    config: parseQaParams('?qa=settlement-approach&x=2366337&z=2374338'),
    terrainView: { floatingOrigin: { getState: () => origin,
      toCanonical: (x, z) => ({ x: x + origin.x, z: z + origin.z }) } },
    viewModeController: { enterWalkMode: spawn => enters.push(spawn) },
    playerController: { setHarnessActive() {}, setHarnessKeys() {}, setPose: pose => poses.push(pose) },
  });
  harness.start();
  origin = { x: 2366336, z: 2374272 };
  harness.start();
  assert.deepEqual(enters, [{ x: 2366337, z: 2374338 }, { x: 1, z: 66 }]);
  assert.equal(poses[1].x + origin.x, poses[0].x);
  assert.equal(poses[1].z + origin.z, poses[0].z);
  // An explicit replacement spawn remains render-space, as the public API promises.
  harness.config = { ...harness.config, spawn: { x: 10, z: 20 } };
  harness.start();
  assert.deepEqual(enters.at(-1), { x: 10, z: 20 });
});
