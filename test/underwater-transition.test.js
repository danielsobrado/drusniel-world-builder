import assert from 'node:assert/strict';
import test from 'node:test';
import { validateUnderwaterConfig } from '../src/editor/water/UnderwaterConfig.js';
import {
  advanceUnderwaterBlend,
  mixNumber,
  resolveWaterlineNearPlane,
} from '../src/editor/water/UnderwaterTransition.js';

const config = Object.freeze({
  backgroundColor: '#123456',
  fogColor: '#234567',
  fogDensity: 0.05,
  lightScale: 0.4,
  transitionSeconds: 0.25,
  nearPlane: 0.15,
});

test('underwater transition is bounded and reversible', () => {
  assert.equal(advanceUnderwaterBlend(0, true, 0.125, 0.25), 0.5);
  assert.equal(advanceUnderwaterBlend(0.5, true, 1, 0.25), 1);
  assert.equal(advanceUnderwaterBlend(1, false, 0.125, 0.25), 0.5);
  assert.equal(advanceUnderwaterBlend(0.5, false, 1, 0.25), 0);
  assert.equal(mixNumber(10, 20, 0.25), 12.5);
});

test('underwater visual settings reject unsafe values', () => {
  assert.equal(validateUnderwaterConfig(config), config);
  assert.throws(
    () => validateUnderwaterConfig({ ...config, lightScale: 2 }),
    /lightScale/,
  );
  assert.throws(
    () => validateUnderwaterConfig({ ...config, nearPlane: 0 }),
    /nearPlane/,
  );
});

test('waterline near plane tightens before swimming eye height clips the water mesh', () => {
  const base = { surfaceNearPlane: 0.5, underwaterNearPlane: 0.15, blend: 0, waterlineEnabled: true, surfaceHeight: 10 };
  assert.equal(resolveWaterlineNearPlane({ ...base, eyeY: 11.7 }), 0.5, 'standing high keeps full near plane');
  assert.ok(resolveWaterlineNearPlane({ ...base, eyeY: 10.35 }) <= 0.15, 'swimming eye at +0.35m never clips at 0.5m');
  assert.ok(resolveWaterlineNearPlane({ ...base, eyeY: 10.08 }) < 0.10, 'bobbing right at the surface tightens further');
  assert.equal(resolveWaterlineNearPlane({ ...base, blend: 1, eyeY: 9.0 }), 0.15, 'fully submerged uses underwater nearPlane');
  assert.equal(resolveWaterlineNearPlane({ ...base, waterlineEnabled: false, eyeY: 10.2 }), 0.5, 'dry state restores surface nearPlane');
});
