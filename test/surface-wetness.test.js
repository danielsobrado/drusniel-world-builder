import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';

import { SurfaceWetness } from '../src/editor/weather/surfaceWetness.js';
import {
  DEFAULT_SURFACE_WETNESS,
  resolveSurfaceWetnessConfig,
} from '../src/editor/weather/surfaceWetnessConfig.js';

function run(wetness, seconds, rain) {
  for (let t = 0; t < seconds; t += 0.5) wetness.update(0.5, rain);
  return wetness.value;
}

test('rain soaks the ground quickly and it dries slowly', () => {
  const target = { value: 0 };
  const wetness = new SurfaceWetness(DEFAULT_SURFACE_WETNESS, target);
  assert.ok(Math.abs(run(wetness, 20, 1) - 0.5) < 1e-9, 'half soaked after half of wetSeconds');
  assert.equal(run(wetness, 40, 1), 1);
  assert.equal(target.value, 1, 'the shader uniform follows');
  // Drizzle holds the ground at its own level rather than soaking it.
  assert.ok(Math.abs(run(wetness, 120, 0.3) - 0.5) < 1e-9);
  assert.equal(run(wetness, 600, 0.3), 0.3);
  assert.ok(Math.abs(run(wetness, 60, 0) - 0.05) < 1e-9, 'drying takes drySeconds for a full soak');
  assert.equal(run(wetness, 60, 0), 0);
  assert.equal(wetness.update(0, 1), 0, 'no time, no change');
});

test('wetness settings default and reject nonsense', () => {
  assert.deepEqual(resolveSurfaceWetnessConfig(undefined), DEFAULT_SURFACE_WETNESS);
  assert.equal(resolveSurfaceWetnessConfig({ drySeconds: 30 }).drySeconds, 30);
  assert.throws(() => resolveSurfaceWetnessConfig({ wetSeconds: 0 }), /wetSeconds/);
  assert.throws(() => resolveSurfaceWetnessConfig({ darkening: 1.5 }), /darkening/);
  assert.throws(() => resolveSurfaceWetnessConfig({ canopyShelter: -1 }), /canopyShelter/);
});

test('roof runoff, stone and timber have distinct uptake and drying without frame-rate dependence', () => {
  const simulate = (step) => {
    const buildingTarget = { value: new Vector3() };
    const state = new SurfaceWetness(DEFAULT_SURFACE_WETNESS, { value: 0 }, buildingTarget);
    for (let t = 0; t < 16; t += step) state.update(step, 1);
    const partial = buildingTarget.value.clone();
    assert.ok(partial.z > partial.x && partial.x > partial.y, 'roofs wet fastest; timber absorbs slowly');
    state.update(80, 1);
    assert.deepEqual(buildingTarget.value.toArray(), [1, 1, 1]);
    for (let t = 0; t < 60; t += step) state.update(step, 0);
    const drying = buildingTarget.value.clone();
    assert.ok(drying.z < drying.x && drying.x < drying.y, 'timber holds water; roofs drain sooner');
    state.update(0, 1); state.update(1, NaN); state.update(Infinity, 1);
    assert.deepEqual(buildingTarget.value, drying, 'invalid updates cannot poison shared uniforms');
    state.update(1000, 0);
    assert.deepEqual(buildingTarget.value.toArray(), [0, 0, 0]);
    return [...partial.toArray(), ...drying.toArray()];
  };
  const coarse = simulate(1), fine = simulate(0.25);
  coarse.forEach((value, i) => assert.ok(Math.abs(value - fine[i]) < 1e-10));
});
