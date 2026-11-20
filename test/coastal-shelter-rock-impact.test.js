import assert from 'node:assert/strict';
import test from 'node:test';
import { impactIntensity, impactWaveSample } from '../src/editor/water/CoastalRockImpactMath.js';
import { resolveCoastalRockImpactConfig } from '../src/editor/water/CoastalRockImpactConfig.js';
import { resolveSeaSurf } from '../src/editor/water/SeaSurf.js';
import { directionalCarriers, surfCarrierFrames } from '../src/editor/water/SeaSurfMath.js';
import { seaDiffractionPhaseDelay } from '../src/editor/water/SeaDiffraction.js';
import { seaRefractionPhaseShift } from '../src/editor/water/SeaRefractionMath.js';
import { seaExposure } from '../src/editor/water/WaterAppearance.js';

const surf = resolveSeaSurf({
  enabled: true, model: 'directionalBreakers',
  diffraction: { enabled: true, minimumTransmission: 0.22 },
  refraction: { enabled: true },
});
const sea = { amplitude: 0.9, stormScale: 1.65 };
const water = { depth: 1.6, shoreDistance: 10 };
const settings = resolveCoastalRockImpactConfig({ enabled: true });

test('a sheltered crest loses height before rock wetness and spray are spawned', () => {
  const open = seaExposure(water.shoreDistance);
  const exposed = impactWaveSample(15, -12, water, 7, surf, sea, 1, open);
  const sheltered = impactWaveSample(15, -12, water, 7, surf, sea, 1, open * 0.22);
  assert.ok(Math.abs(sheltered.height / exposed.height - 0.22) < 1e-10);
  const event = wave => impactIntensity({
    height: wave.height, breaking: wave.breaking, exposed: 1.5, reachable: 1,
  }, settings);
  assert.ok(event(exposed) >= settings.minimumImpactIntensity);
  assert.ok(event(sheltered) < event(exposed));
  assert.ok(event(sheltered) < settings.minimumImpactIntensity,
    'a protected rock should not launch spray for a weak crest');
});

test('rock impact crest phase uses the same refraction and diffraction delays as the surf', () => {
  const wave = directionalCarriers[0];
  const shoreDistance = water.shoreDistance;
  const depth = water.depth;
  const x = -4226432, z = 278528, time = 11;
  const exposure = seaExposure(shoreDistance) * 0.35;
  const frames = surfCarrierFrames(wave, 0, surf.directional);
  const [vx, vz] = frames.surfOblique0.wave;
  const phase = wave.phase + time * wave.angularSpeed
    + shoreDistance * surf.directional.waveNumbers[0]
    + seaRefractionPhaseShift(depth, shoreDistance, wave, 0, surf)
    + seaDiffractionPhaseDelay(exposure, shoreDistance, wave.waveNumber, surf.diffraction)
    + x * vx + z * vz;
  const actual = impactWaveSample(x, z, water, time, surf, sea, 0.3, exposure);
  assert.ok(Math.abs(actual.phase - phase) < 1e-8);
  const next = impactWaveSample(x, z, water,
    time + 2 * Math.PI / wave.angularSpeed, surf, sea, 0.3, exposure);
  assert.equal(next.crest, actual.crest + 1);
});

test('disabled shelter leaves existing coastal impact amplitude and phase unchanged', () => {
  const old = resolveSeaSurf({ enabled: true, model: 'directionalBreakers' });
  const exposure = seaExposure(water.shoreDistance);
  const baseline = impactWaveSample(12, -7, water, 2, old, sea, 0.2);
  const explicit = impactWaveSample(12, -7, water, 2, old, sea, 0.2, exposure);
  assert.deepEqual(explicit, baseline);
});
