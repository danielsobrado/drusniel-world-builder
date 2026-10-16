import assert from 'node:assert/strict';
import test from 'node:test';

import { meadowGrowthShare, meadowNoiseNumber, meadowTuftOccupancy } from '../src/editor/stylized/meadow/meadowGrowthMath.js';
import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { resolveMeadowGroundDetail } from '../src/editor/stylized/meadow/meadowGroundDetailConfig.js';
import { MEADOW_TUFT_DEFAULTS } from '../src/editor/stylized/meadow/meadowTuftField.js';

const sample = (fn) => {
  const values = [];
  for (let i = 0; i < 200; i += 1) for (let j = 0; j < 200; j += 1) values.push(fn(-1869 + i * 0.37, -4003 + j * 0.41));
  return values;
};

test('tuft occupancy is bounded, with real gaps and real cores at plant scale', () => {
  const values = sample(meadowTuftOccupancy);
  assert.ok(values.every((v) => v >= 0 && v <= 1));
  const gaps = values.filter((v) => v < 0.05).length / values.length;
  const cores = values.filter((v) => v > 0.95).length / values.length;
  assert.ok(gaps > 0.1 && gaps < 0.4, `gaps ${gaps}`);
  assert.ok(cores > 0.03 && cores < 0.25, `cores ${cores}`);
});

test('growth share leaves the short plateau and stays inside the envelope', () => {
  const shares = sample((x, z) => meadowGrowthShare(meadowNoiseNumber(x / 9, z / 9), meadowTuftOccupancy(x, z)));
  assert.ok(shares.every((s) => s >= 0 && s <= 1));
  const plateau = shares.filter((s) => s < 0.02).length / shares.length;
  // The audit measured 59 % of positions pinned at the short endpoint.
  assert.ok(plateau < 0.2, `plateau ${plateau}`);
  // Without tufts the share is the broadened patch ramp alone.
  assert.equal(meadowGrowthShare(0.2, 1, 0), 0);
  assert.equal(meadowGrowthShare(0.9, 0, 0), 1);
});

test('tufts resolve with defaults, validate, and disable to the untufted stand', () => {
  assert.deepEqual({ ...resolveMeadowGrassConfig({}).tufts }, { ...MEADOW_TUFT_DEFAULTS });
  const off = resolveMeadowGrassConfig({ tufts: { enabled: false } }).tufts;
  assert.equal(off.height, 0);
  assert.equal(off.widthFloor, 1);
  assert.equal(off.bendIsolated, 1);
  assert.throws(() => resolveMeadowGrassConfig({ tufts: { height: 2 } }), /tufts\.height/);
});

test('ground detail packs per-biome litter and amounts by tile id', () => {
  const detail = resolveMeadowGroundDetail({ byTileId: { 9: { litter: '#ff0000', moss: 0.8 } } });
  assert.equal(detail.litter.length, 256 * 4);
  assert.ok(Math.abs(detail.litter[9 * 4] - 1) < 1e-6);
  assert.equal(detail.litter[9 * 4 + 1], 0);
  assert.ok(Math.abs(detail.amounts[9 * 4] - 0.8) < 1e-6);
  // Unlisted biomes take the default; overrides inherit unlisted fields from it.
  assert.ok(Math.abs(detail.amounts[4 * 4 + 2] - 0.6) < 1e-6);
  assert.ok(Math.abs(detail.amounts[9 * 4 + 2] - 0.6) < 1e-6);
  assert.equal(resolveMeadowGroundDetail({ enabled: false }), null);
  assert.throws(() => resolveMeadowGroundDetail({ fadeStart: 50, fadeEnd: 40 }), /fadeStart/);
  assert.throws(() => resolveMeadowGroundDetail({ byTileId: { 300: {} } }), /terrain ID/);
});
