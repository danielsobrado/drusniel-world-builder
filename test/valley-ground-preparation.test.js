import assert from 'node:assert/strict';
import test from 'node:test';
import { ValleyFogController } from '../src/editor/stylized/mist/ValleyFogController.js';

test('valley fog waits for canonical dependencies, slices its patch and publishes the full resolution', () => {
  let calls = 0, ready = false, revision = 0, charges = 0;
  const fog = new ValleyFogController({ config: {}, getHeight: () => { calls++; return 20 + revision; },
    prepareBounds: () => ready, getRevision: () => revision });
  const focus = { x: 0, z: 0 }, origin = { x: 0, z: 0 };
  const frame = () => {
    let units = 0;
    fog.update(focus, origin, { weight: .7, budget: {
      runner: run => { charges++; return run(); }, shouldYield: () => ++units > 1,
    } });
  };
  frame(); assert.equal(calls, 0); assert.equal(fog.uniforms.weight.value, 0);
  ready = true;
  for (let turn = 0; turn < 70 && fog.patch.job; turn++) {
    const before = calls; frame(); assert.ok(calls - before <= 65);
  }
  assert.equal(fog.patch.ready, true); assert.equal(fog.patch.resolution, 64);
  assert.equal(fog.patch.data.length, 4096); assert.equal(fog.uniforms.weight.value, .7);
  const previous = fog.patch.data;
  revision++; frame(); assert.equal(fog.patch.data, previous);
  while (fog.patch.job) frame();
  assert.equal(fog.patch.uniforms.base.value, 21); assert.ok(charges > 60);
  const before = calls; focus.x = -4096; origin.x = 4096; frame();
  assert.equal(calls, before); fog.dispose();
});
