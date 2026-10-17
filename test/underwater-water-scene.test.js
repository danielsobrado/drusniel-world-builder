import assert from 'node:assert/strict';
import test from 'node:test';
import { UnderwaterWaterScene } from '../src/editor/water/UnderwaterWaterScene.js';

test('optical scene draws known water with the current plain variant and restores surface refraction', () => {
  const plain = {}, refractive = {}, hiddenMaterial = {};
  const slot = { material: plain, mesh: { visible: true, material: refractive } };
  const hidden = { material: {}, mesh: { visible: false, material: hiddenMaterial } };
  const slots = [slot, hidden];
  const pass = new UnderwaterWaterScene(() => slots);
  assert.equal(pass.render(() => {
    assert.equal(slot.mesh.material, plain);
    assert.equal(hidden.mesh.material, hiddenMaterial);
    return 'drawn';
  }), 'drawn');
  assert.equal(slot.mesh.material, refractive);
  assert.equal(pass.restore.length, 0);
  const replacement = {};
  slot.material = replacement;
  pass.render(() => assert.equal(slot.mesh.material, replacement));
  assert.equal(slot.mesh.material, refractive, 'material-pool changes do not leave stale plain bindings');
});

test('failed underwater draws restore every surface material and leave the next pass usable', () => {
  const slots = Array.from({ length: 2 }, () => ({ material: {}, mesh: { visible: true, material: {} } }));
  const before = slots.map(slot => slot.mesh.material);
  const pass = new UnderwaterWaterScene(slots);
  assert.throws(() => pass.render(() => { throw new Error('GPU failure'); }), /GPU failure/);
  assert.deepEqual(slots.map(slot => slot.mesh.material), before);
  assert.equal(pass.restore.length, 0);
  pass.render(() => assert.ok(slots.every(slot => slot.mesh.material === slot.material)));
  assert.deepEqual(slots.map(slot => slot.mesh.material), before);
});
