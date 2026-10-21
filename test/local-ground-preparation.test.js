import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalGroundHeight } from '../src/editor/stylized/ambient/LocalGroundHeight.js';

test('ground patches publish atomically in bounded slices and pure rebases only move uniforms', () => {
  let calls = 0, revision = 0;
  const getHeight = (x, z) => { calls++; return 20 + x * .1 + z * .2 + revision; };
  const ground = new LocalGroundHeight({ getHeight, getRevision: () => revision });
  const focus = { x: 0, z: 0 }, origin = { x: 0, z: 0 };
  const frame = () => { let checks = 0; ground.update(focus, origin, () => ++checks > 1); };
  frame(); assert.equal(ground.ready, false); assert.ok(calls <= 65);
  let turns = 1;
  while (ground.job) { const before = calls; frame(); assert.ok(calls - before <= 64); assert.ok(++turns < 100); }
  assert.equal(ground.rebuilds, 1);
  const pixels = ground.data.slice(), before = calls;
  focus.x = -4096; origin.x = 4096; frame();
  assert.equal(calls, before); assert.deepEqual(ground.data, pixels);
  assert.equal(ground.uniforms.corner.value.x + origin.x, -64);
  revision++; frame();
  assert.deepEqual(ground.data, pixels, 'an edited replacement remains detached until complete');
  while (ground.job) frame();
  assert.equal(ground.uniforms.base.value, 21);
  assert.deepEqual(ground.data, pixels, 'a uniform terrain raise changes the base, preserving relative texels');
  ground.dispose();
});

test('unprepared terrain is never sampled and obsolete jobs cannot publish', () => {
  let prepared = false, calls = 0, revision = 0;
  const ground = new LocalGroundHeight({ getHeight: () => { calls++; return 10; },
    prepareBounds: () => prepared, getRevision: () => revision });
  ground.update({ x: 0, z: 0 }, { x: 0, z: 0 });
  assert.equal(calls, 0); assert.equal(ground.ready, false);
  revision++; prepared = true;
  ground.update({ x: 5000, z: 0 }, { x: 0, z: 0 });
  assert.equal(ground.rebuilds, 1);
  assert.ok(Math.abs(ground.center.x - 5000) < 2);
  ground.dispose();
});
