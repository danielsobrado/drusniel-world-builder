import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCoastalRockImpactConfig, coastalRockImpactEnabled } from '../src/editor/water/CoastalRockImpactConfig.js';
import {
  impactCrestIndex, impactContactPoint, impactDecay, impactDroplet, impactHash,
  impactIntensity, impactWaveSample,
} from '../src/editor/water/CoastalRockImpactMath.js';
import { resolveSeaSurf } from '../src/editor/water/SeaSurf.js';
import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';

const settings = resolveCoastalRockImpactConfig({ enabled: true });

test('rock impacts validate bounds, quality, and field alignment', () => {
  assert.equal(coastalRockImpactEnabled(settings, 'high'), true);
  assert.equal(coastalRockImpactEnabled(settings, 'low'), false);
  assert.equal(coastalRockImpactEnabled(resolveCoastalRockImpactConfig(), 'ultra'), false);
  assert.throws(() => resolveCoastalRockImpactConfig({ maximumCandidates: 0 }), /maximumCandidates/);
  assert.throws(() => resolveCoastalRockImpactConfig({ maximumActiveSites: 70 }), /maximumActiveSites/);
  assert.throws(() => resolveCoastalRockImpactConfig({ field: { resolution: 128 } }), /field.resolution/);
  assert.throws(() => resolveCoastalRockImpactConfig({ field: { scrollMeters: 7.3 } }), /alignment/);
  assert.throws(() => resolveCoastalRockImpactConfig({ wetness: { decaySeconds: -1 } }), /decaySeconds/);
  assert.throws(() => resolveCoastalRockImpactConfig({ spray: { enabled: 1 } }), /boolean/);
  assert.throws(() => resolveCoastalRockImpactConfig({ quality: { extreme: true } }), /supported boolean/);
});

test('phase crossings produce one new crest per wave period', () => {
  const wave = SEA_SWELL_COMPONENTS[0];
  const p = 1.57;
  assert.equal(impactCrestIndex(p + 2 * Math.PI), impactCrestIndex(p) + 1);
  const surf = resolveSeaSurf({ enabled: true, model: 'directionalBreakers' });
  const sea = { amplitude: 0.9, stormScale: 1.6 };
  const water = { depth: 1.5, shoreDistance: 14 };
  for (const [x, z] of [[0, 0], [-4226432, 278528], [-9000000, 6000000]]) {
    const a = impactWaveSample(x, z, water, 4, surf, sea, 0.3);
    const b = impactWaveSample(x, z, water, 4 + 2 * Math.PI / wave.angularSpeed, surf, sea, 0.3);
    assert.equal(b.crest, a.crest + 1);
    assert.ok(a.height >= 0);
    assert.ok(a.breaking >= 0 && a.breaking <= 1);
  }
});

test('windward impact point opposes the wave direction on every coast orientation', () => {
  const rock = { x: 42, z: -27, radius: 2 };
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.6, 0.8]]) {
    const point = impactContactPoint(rock, dx, dz);
    assert.ok((point.x - rock.x) * dx + (point.z - rock.z) * dz < 0);
    assert.ok(Math.abs(Math.hypot(point.x - rock.x, point.z - rock.z) - 1.7) < 1e-8);
  }
});

test('impact response is bounded and monotonic with wave energy', () => {
  const input = { breaking: 0.65, exposed: 1.1, reachable: 1 };
  const weak = impactIntensity({ ...input, height: 0.3 }, settings);
  const strong = impactIntensity({ ...input, height: 1.2 }, settings);
  assert.ok(strong > weak);
  for (const h of [0, 0.1, 1, 10, 100]) {
    const value = impactIntensity({ ...input, height: h }, settings);
    assert.ok(value >= 0 && value <= 1);
  }
  assert.equal(impactIntensity({ ...input, reachable: 0, height: 10 }, settings), 0);
});

test('spray seeds and ballistic motion are reproducible and finite', () => {
  const event = { rockId: 'coast-42', crestId: 17, directionX: 0.8, directionZ: 0.6, intensity: 0.8 };
  const p = impactDroplet(event, 4, settings.spray);
  assert.deepEqual(p, impactDroplet(event, 4, settings.spray));
  assert.notDeepEqual(p, impactDroplet(event, 5, settings.spray));
  assert.equal(impactHash('stone', 12, 3), impactHash('stone', 12, 3));
  assert.ok(p.life >= settings.spray.minLifetimeSeconds && p.life <= settings.spray.maxLifetimeSeconds);
  for (const age of [0, 0.2, 0.5, p.life]) {
    const y = p.vy * age - 4.905 * age * age;
    assert.ok(Number.isFinite(y));
  }
});

test('impact moisture outlives foam and decays independently of update frequency', () => {
  const evolve = (lifetime, hz) => {
    let value = 1;
    for (let i = 0; i < 10 * hz; i++) value = impactDecay(value, 1 / hz, lifetime);
    return value;
  };
  const foam = evolve(settings.foam.decaySeconds, 30);
  const wet = evolve(settings.wetness.decaySeconds, 30);
  assert.ok(wet > foam);
  assert.ok(Math.abs(wet - evolve(settings.wetness.decaySeconds, 120)) < 1e-11);
});
