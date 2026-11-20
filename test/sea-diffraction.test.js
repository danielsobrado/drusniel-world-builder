import assert from 'node:assert/strict';
import test from 'node:test';
import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';
import {
  createSeaDiffractionSampler, resolveSeaDiffraction, seaDiffractionPhaseDelay,
} from '../src/editor/water/SeaDiffraction.js';
import { seaExposure } from '../src/editor/water/WaterAppearance.js';

const config = resolveSeaDiffraction({ enabled: true });

function oceanWithBarrier({ start = 28, end = 48, minZ = -38, maxZ = 38 } = {}) {
  return (cellX, cellZ) => {
    const x = cellX * 2, z = -cellZ * 2;
    const land = x >= start && x <= end && z >= minZ && z <= maxZ;
    return { kind: land ? 0 : 1, coverage: land ? 0 : 1 };
  };
}

test('unobstructed water keeps the original wave energy', () => {
  const field = createSeaDiffractionSampler({
    sampleWater: () => ({ kind: 1, coverage: 1 }),
    tileSizeMeters: 2, settings: config,
  });
  for (const [x, z] of [[0, 0], [32, 16], [-4226432, 278528]]) {
    assert.equal(field(x, z, 10), 1);
  }
  assert.equal(field(0, 0, 100), 1);
});

test('headland land blocks upstream waves while windward ocean stays exposed', () => {
  const field = createSeaDiffractionSampler({
    sampleWater: oceanWithBarrier(),
    tileSizeMeters: 2, settings: config,
  });
  const lee = field(0, 0, 12);
  const windward = field(72 / 2, 0, 12);
  assert.ok(lee < 0.5, `expected sheltered water, got ${lee}`);
  assert.equal(windward, 1);
  assert.ok(lee >= config.minimumTransmission);
  const farOffshore = field(0, 0, 100);
  assert.equal(farOffshore, 1);
});

test('angular probes soften headland shadows at a cove entrance', () => {
  const field = createSeaDiffractionSampler({
    sampleWater: oceanWithBarrier({ start: 28, end: 48, minZ: 10, maxZ: 38 }),
    tileSizeMeters: 2, settings: config,
  });
  const open = field(0, -28, 12);
  const edge = field(0, 0, 12);
  const blocked = field(0, -10, 12);
  assert.ok(open >= edge, `open ${open} should exceed edge ${edge}`);
  assert.ok(edge >= blocked, `edge ${edge} should exceed blocked ${blocked}`);
  assert.ok(edge > config.minimumTransmission, 'side angles carry energy around the tip');
});

test('world-aligned lattice is stable across chunk boundaries and floating-origin shifts', () => {
  const water = oceanWithBarrier();
  const left = createSeaDiffractionSampler({ sampleWater: water, tileSizeMeters: 2, settings: config });
  const right = createSeaDiffractionSampler({ sampleWater: water, tileSizeMeters: 2, settings: config });
  for (const [x, z] of [[0, 0], [16, -16], [-4226432, 278528], [-9000000, 6000000]]) {
    assert.equal(left(x, z, 12), right(x, z, 12));
  }
  assert.ok(Math.abs(left(-0.001, 0, 12) - left(0.001, 0, 12)) < 0.001);
});

test('visual shore-exposure ratio drives the same bounded phase lag', () => {
  const waveNumber = SEA_SWELL_COMPONENTS[0].waveNumber;
  const baseline = seaExposure(12);
  const sheltered = baseline * config.minimumTransmission;
  assert.equal(seaDiffractionPhaseDelay(baseline, 12, waveNumber, config), 0);
  assert.ok(seaDiffractionPhaseDelay(sheltered, 12, waveNumber, config) < 0);
  assert.ok(Math.abs(seaDiffractionPhaseDelay(sheltered, 12, waveNumber, config))
    <= waveNumber * config.phaseLagMeters);
  assert.equal(seaDiffractionPhaseDelay(sheltered, 12, waveNumber,
    resolveSeaDiffraction()), 0);
});

test('configuration rejects unbounded probe and phase budgets', () => {
  for (const source of [
    { enabled: 'yes' }, { rayReachMeters: 1000 }, { rayStepMeters: 0 },
    { latticeStepMeters: 1 }, { angularSpreadRadians: 3 },
    { minimumTransmission: -1 }, { phaseLagMeters: Infinity },
    { offshoreFadeStartMeters: 90, offshoreFadeEndMeters: 20 },
  ]) assert.throws(() => resolveSeaDiffraction(source), /diffraction/);
});
