import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coastalWindowOrigin, coastalScrollCells, coastalDecay, coastalFlowVelocity, coastalFoamStep,
} from '../src/editor/water/CoastalSwashMath.js';
import { coastalSwashResolution, resolveCoastalSwashConfig } from '../src/editor/water/CoastalSwashConfig.js';
import { distanceTransform } from '../src/editor/water/CoastalSwashInputs.js';

const config = resolveCoastalSwashConfig();

test('persistent swash configuration selects only supported quality tiers and validates resources', () => {
  assert.equal(coastalSwashResolution(config, 'low'), 0);
  assert.equal(coastalSwashResolution(config, 'medium'), 0);
  assert.equal(coastalSwashResolution(config, 'high'), 256);
  assert.equal(coastalSwashResolution(config, 'ultra'), 512);
  assert.throws(() => resolveCoastalSwashConfig({ fixedHz: 0 }), /fixedHz/);
  assert.throws(() => resolveCoastalSwashConfig({ highResolution: 300 }), /highResolution/);
  assert.throws(() => resolveCoastalSwashConfig({ scrollMeters: 8.25 }), /align/);
  assert.throws(() => resolveCoastalSwashConfig({ foamDrySeconds: -1 }), /foamDrySeconds/);
  assert.throws(() => resolveCoastalSwashConfig({ enabled: 1 }), /enabled/);
});

test('camera-local texel addressing retains canonical cells across scroll and planet-scale coordinates', () => {
  const span = 64, snap = 8, texel = 0.25;
  for (const [x, z] of [[0, 0], [-4226432, 278528], [-9000000, 6000000]]) {
    const a = coastalWindowOrigin(x, span, snap);
    const b = coastalWindowOrigin(x + 8, span, snap);
    const shift = coastalScrollCells(a, b, texel);
    assert.equal(shift, 32);
    assert.equal((a - b) / texel, -shift);
    const worldCell = x + 1.125;
    const oldU = (worldCell - a) / texel;
    const newU = (worldCell - b) / texel;
    assert.ok(Math.abs((newU + shift) - oldU) < 1e-9);
    // Negative origins leave -0 under %, which strict equality rejects; check alignment instead.
    assert.ok(Number.isInteger(coastalWindowOrigin(z, span, snap) / snap));
  }
});

test('coast-normal flow reverses for retreat without depending on global coast orientation', () => {
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.6, 0.8]]) {
    const incoming = coastalFlowVelocity(0.5, x, z, 0.2, 1, config);
    const outgoing = coastalFlowVelocity(-0.5, x, z, 0.2, 1, config);
    assert.ok(incoming.x * x + incoming.z * z > 0);
    assert.ok(outgoing.x * x + outgoing.z * z < 0);
    assert.ok(Math.hypot(incoming.x, incoming.z) <= config.maxUprushSpeed + 1e-9);
    assert.ok(Math.hypot(outgoing.x, outgoing.z) <= config.maxBackwashSpeed + 1e-9);
  }
  assert.deepEqual(coastalFlowVelocity(1, 0, 0, .1, .4, config), { x: 0, z: 0 });
});

test('advancing wave injects foam and retreat deposits bubble residue', () => {
  const empty = { wetness: 0, film: 0, mobileFoam: 0, strandedFoam: 0 };
  const fresh = coastalFoamStep({
    ...empty, coveragePrevious: 0, coverageNow: 1, breaking: 0.9, foamPattern: 1,
  }, 1 / 30, config);
  assert.ok(fresh.mobileFoam > 0);
  assert.equal(fresh.strandedFoam, 0);
  assert.equal(fresh.wetness, 1);
  const retreat = coastalFoamStep({
    ...fresh, coveragePrevious: 1, coverageNow: 0, breaking: 0.9, foamPattern: 1,
  }, 1 / 30, config);
  assert.ok(retreat.mobileFoam < fresh.mobileFoam);
  assert.ok(retreat.strandedFoam > 0);
  assert.ok(retreat.wetness > retreat.film);
});

test('wet sand outlives both water film and stranded foam', () => {
  let state = { wetness: 1, film: 1, mobileFoam: 1, strandedFoam: 1 };
  const step = 1 / 30;
  for (let i = 0; i < 300; i++) {
    state = coastalFoamStep({
      ...state, coveragePrevious: 0, coverageNow: 0, breaking: 0, foamPattern: 1,
    }, step, config);
  }
  assert.ok(state.wetness > state.film);
  assert.ok(state.wetness > state.strandedFoam);
  for (const value of Object.values(state)) assert.ok(value >= 0 && value <= 1);
  assert.ok(Math.abs(coastalDecay(10, 18) - Math.exp(-10 / 18)) < 1e-12);
});

test('wave arrival and dry decay are timestep independent', () => {
  const evolve = hz => {
    let state = { wetness: 1, film: 1, mobileFoam: .8, strandedFoam: .6 };
    for (let i = 0; i < hz * 4; i++) {
      state = coastalFoamStep({
        ...state, coveragePrevious: 0, coverageNow: 0, breaking: 0, foamPattern: 1,
      }, 1 / hz, config);
    }
    return state;
  };
  const slow = evolve(30), fast = evolve(120);
  for (const key of ['wetness', 'film', 'mobileFoam', 'strandedFoam']) {
    assert.ok(Math.abs(slow[key] - fast[key]) < 0.01, key);
  }
});

test('shoreline transform remains orientation-independent', () => {
  const width = 7;
  const mask = Uint8Array.from({ length: width * width }, (_, i) => i % width < 3 ? 1 : 0);
  const toOcean = distanceTransform(mask, width, 1);
  const toLand = distanceTransform(mask, width, 0);
  for (let y = 1; y < width - 1; y++) {
    assert.equal(toOcean[y * width + 2], 0);
    assert.equal(toOcean[y * width + 3], 1);
    assert.equal(toLand[y * width + 2], 1);
    assert.equal(toLand[y * width + 3], 0);
  }
  const rotated = Uint8Array.from({ length: width * width }, (_, i) => Math.floor(i / width) < 3 ? 1 : 0);
  const rotatedDistance = distanceTransform(rotated, width, 1);
  assert.equal(rotatedDistance[3 * width + 3], 1);
});
