import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import yaml from 'js-yaml';
import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';
import { resolveSeaSurf, sampleSeaSurfDisplacementCpu } from '../src/editor/water/SeaSurf.js';
import { directionalCarriers, evaluateDirectionalSurfCpu } from '../src/editor/water/SeaSurfMath.js';
import {
  createSeaRefractionCarrier, sampleSeaRefraction, seaRefractionPhaseShift,
} from '../src/editor/water/SeaRefractionMath.js';

const settings = resolveSeaSurf({ enabled: true, model: 'directionalBreakers',
  refraction: { enabled: true } });
const wave = directionalCarriers[0];
const carrier = createSeaRefractionCarrier(wave, settings.directional.waveNumbers[0], settings.directional);

test('the finite-depth dispersion correction follows Snell refraction', () => {
  const shallow = sampleSeaRefraction(0.5, 10, carrier, settings.refraction);
  const reference = sampleSeaRefraction(settings.directional.referenceDepthMeters, 10, carrier, settings.refraction);
  const deep = sampleSeaRefraction(5, 10, carrier, settings.refraction);
  assert.ok(shallow.localWaveNumber > reference.localWaveNumber);
  assert.ok(shallow.refractedSine < reference.refractedSine);
  assert.ok(deep.refractedSine > reference.refractedSine);
  assert.ok(Math.abs(reference.phaseShift) < 1e-10);
  assert.ok(shallow.phaseShift > 0);
  assert.ok(shallow.localWaveNumber <= carrier.referenceWaveNumber * settings.refraction.maximumWaveNumberRatio);
});

test('refraction is bounded at zero depth, far offshore and grazing headlands', () => {
  for (const depth of [0, 0.05, 0.4, 1, 2, 5, 6, 40]) {
    for (const distance of [0, 0.1, 4, 35, 1000, 1e9]) {
      const sample = sampleSeaRefraction(depth, distance, carrier, settings.refraction);
      for (const value of Object.values(sample)) assert.ok(Number.isFinite(value));
      assert.ok(sample.refractedSine >= 0 && sample.refractedSine <= 1);
      if (distance === 0 || depth >= settings.refraction.fadeEndMeters) {
        assert.equal(sample.phaseShift, 0);
      }
    }
  }
});

test('shoreline-contour phase is continuous around a curved coast and across chunks', () => {
  const radius = 36, depth = 0.75, shoreDistance = 8;
  const phaseAt = (x, z) => {
    const distance = Math.hypot(x, z) - radius;
    return distance * carrier.referenceWaveNumber
      + sampleSeaRefraction(depth, distance, carrier, settings.refraction).phaseShift;
  };
  for (const angle of [0, 0.2, Math.PI / 2, Math.PI * 0.85, Math.PI]) {
    const x = (radius + shoreDistance) * Math.cos(angle);
    const z = (radius + shoreDistance) * Math.sin(angle);
    assert.ok(Math.abs(phaseAt(x, z) - phaseAt(radius + shoreDistance, 0)) < 1e-10);
  }
  for (const [x, z] of [[0, 0], [-4226432, 278528], [-9000000, 6000000]]) {
    const actual = seaRefractionPhaseShift(depth, shoreDistance, wave, 0, settings);
    const adjacentChunk = seaRefractionPhaseShift(depth, shoreDistance, wave, 0, settings);
    assert.equal(actual, adjacentChunk, `wave correction depends on distant origin ${x}, ${z}`);
  }
});

test('wave fronts do not reverse across representative beach slopes', () => {
  for (const gradient of [0.025, 0.05, 0.1, 0.2, 0.4]) {
    let previous = 0;
    for (let step = 1; step <= 300; step++) {
      const distance = step * 0.1;
      const depth = distance * gradient;
      const phase = carrier.referenceWaveNumber * distance
        + sampleSeaRefraction(depth, distance, carrier, settings.refraction).phaseShift;
      assert.ok(phase > previous, `phase folded at shore slope ${gradient}, distance ${distance}`);
      previous = phase;
    }
  }
});

test('refraction is disabled by default and does not alter legacy surf', () => {
  const old = resolveSeaSurf({ enabled: true, model: 'directionalBreakers' });
  assert.equal(old.refraction.enabled, false);
  const before = evaluateDirectionalSurfCpu(15, 27, 1, 12, 3, old,
    { amplitude: 0.9, stormScale: 1.5 }, 0.2, 1);
  const off = resolveSeaSurf({ enabled: true, model: 'directionalBreakers',
    refraction: { enabled: false, strength: 1 } });
  assert.deepEqual(before, evaluateDirectionalSurfCpu(15, 27, 1, 12, 3, off,
    { amplitude: 0.9, stormScale: 1.5 }, 0.2, 1));
  assert.equal(seaRefractionPhaseShift(1, 12, wave, 0, old), 0);
  assert.equal(sampleSeaSurfDisplacementCpu(15, 27, 20, 50, 3, 0.3, settings,
    { amplitude: 0.9, stormScale: 1.5 }, 0.2, 1, 0.5),
  sampleSeaSurfDisplacementCpu(15, 27, 20, 50, 3, 0.3, off,
    { amplitude: 0.9, stormScale: 1.5 }, 0.2, 1, 0.5));
});

test('refraction rejects invalid tuning, including when legacy is selected', () => {
  assert.throws(() => resolveSeaSurf({ enabled: true, model: 'directionalBreakers',
    directional: { referenceDepthMeters: 0.5 },
    refraction: { minimumDepthMeters: 0.6 } }), /minimumDepthMeters/);
  for (const refraction of [
    { strength: 2 }, { minimumDepthMeters: 0 },
    { maximumWaveNumberRatio: 0.5 }, { fadeStartMeters: 7, fadeEndMeters: 6 },
    { maximumPhaseDistanceMeters: 0 }, { enabled: 'yes' },
  ]) {
    assert.throws(() => resolveSeaSurf({ enabled: true, model: 'directionalBreakers',
      refraction }), /refraction/);
    assert.throws(() => resolveSeaSurf({ enabled: true, model: 'legacy',
      refraction }), /refraction/);
  }
});

test('shipped YAML enables refraction for directional ocean surf only', async () => {
  const visual = yaml.load(await readFile(new URL('../config/water-visual.yaml', import.meta.url), 'utf8'));
  const surf = resolveSeaSurf(visual.water.sea.surf);
  assert.equal(surf.refraction.enabled, true);
  assert.equal(surf.model, 'directionalBreakers');
  assert.equal(surf.directional.waveNumbers.length, SEA_SWELL_COMPONENTS.slice(0, 3).length);
});
