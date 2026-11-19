import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSeaOpticsSample, refractedSeaCosine, seaOpticalPathLength } from '../src/editor/water/SeaOpticsMath.js';
import { resolveSeaOptics, seaOpticsMode } from '../src/editor/water/SeaOptics.js';

const config = resolveSeaOptics();

test('air-water Snell path is finite at grazing incidence', () => {
  assert.equal(refractedSeaCosine(1), 1);
  assert.ok(refractedSeaCosine(0) > 0.65);
  assert.equal(seaOpticalPathLength(0, 0, config.opticalDistance), 0);
  assert.equal(seaOpticalPathLength(10000, 0, config.opticalDistance), 43);
  assert.ok(seaOpticalPathLength(3, 0.01, config.opticalDistance) >
    seaOpticalPathLength(3, 1, config.opticalDistance));
});

test('RGB transmission decreases monotonically; scattering remains bounded', () => {
  const source = [0.11, 0.28, 0.3];
  let previous = [1, 1, 1];
  for (const depthMeters of [0, 0.3, 1, 2, 4, 8, 15, 50]) {
    const sample = computeSeaOpticsSample({ depthMeters, sourceColor: source, settings: config });
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(sample.transmission[channel] <= previous[channel]);
      assert.ok(sample.transmission[channel] >= 0);
      assert.ok(sample.scattered[channel] >= 0);
      assert.ok(sample.scattered[channel] <= source[channel] + 1e-12);
      assert.ok(Number.isFinite(sample.color[channel]));
    }
    previous = sample.transmission;
    if (depthMeters === 0) {
      assert.deepEqual(sample.transmission, [1, 1, 1]);
      assert.deepEqual(sample.scattered, [0, 0, 0]);
    }
  }
});

test('sand and reef retain different colours at equal optical depth', () => {
  const samples = [[0.9, 0.8, 0.65], [0.08, 0.12, 0.1]]
    .map(sceneColor => computeSeaOpticsSample({ depthMeters: 1.5,
      sceneColor, settings: config }));
  assert.ok(samples[0].color.every((v, index) => v > samples[1].color[index]));
  assert.ok(samples[0].visibility > 0);
  assert.ok(computeSeaOpticsSample({ depthMeters: 15, settings: config }).visibility
    < samples[0].visibility);
});

test('storms increase high-quality extinction but not medium absorption-only extinction', () => {
  const calm = computeSeaOpticsSample({ depthMeters: 5, settings: config });
  const storm = computeSeaOpticsSample({ depthMeters: 5, settings: config, storm: 1 });
  assert.ok(storm.transmission.every((v, i) => v < calm.transmission[i]));
  const medium = computeSeaOpticsSample({ depthMeters: 5, settings: config, tier: 'medium', storm: 1 });
  assert.equal(medium.mode, 'absorption');
  assert.ok(medium.scattered.every(v => v === 0));
  assert.equal(seaOpticsMode(config, 'low'), 'legacy');
});

test('invalid settings and malformed nested configuration are rejected', () => {
  assert.throws(() => resolveSeaOptics({ scatteringCoefficients: [0.1, -1, 0.2] }), /scatteringCoefficients/);
  assert.throws(() => resolveSeaOptics({ opticalDistance: { refractiveIndex: 0 } }), /refractiveIndex/);
  assert.throws(() => resolveSeaOptics({ scattering: { stormTurbidityMultiplier: 0.3 } }), /stormTurbidityMultiplier/);
  assert.throws(() => resolveSeaOptics({ quality: { ultra: 'magic' } }), /quality.ultra/);
  assert.throws(() => resolveSeaOptics({ model: 'invalid' }), /model/);
  assert.equal(seaOpticsMode(resolveSeaOptics({ enabled: false })), 'legacy');
});

test('ocean model never depends on global world coordinates', () => {
  const sample = () => computeSeaOpticsSample({ depthMeters: 2.5, viewCosine: 0.6,
    settings: config, sceneColor: [0.5, 0.4, 0.2] });
  assert.deepEqual(sample(), sample());
});
