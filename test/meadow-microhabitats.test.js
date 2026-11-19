import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'js-yaml';

import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { resolveMeadowGrowth } from '../src/editor/stylized/meadow/meadowGrowthProfiles.js';
import { createMeadowUniforms } from '../src/editor/stylized/meadow/meadowUniforms.js';
import { meadowGrowthSignature, meadowPageGrowthKey, reconcileMeadowGrowth } from '../src/editor/stylized/meadow/MeadowGrowthUpdates.js';
import { encodeLookTable } from '../src/editor/stylized/meadow/meadowPalettes.js';
import {
  MEADOW_MICROHABITAT_DEFAULTS,
  meadowMicrohabitatNumber,
  meadowMicrohabitatWeights,
  resolveMeadowMicrohabitat,
} from '../src/editor/stylized/meadow/meadowMicrohabitat.js';

const meadow = load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'))
  .stylizedSurface.grass.meadow;

test('shipped biomes respond differently to the same ecological niches', () => {
  const { growth } = resolveMeadowGrassConfig(meadow);
  const at = id => growth.profiles[growth.table[id]];
  assert.ok(growth.profiles.length <= 16);
  assert.equal(at(0).density, 0);
  assert.equal(at(11).density, 0);
  assert.ok(at(7).microhabitat.shelter > at(3).microhabitat.shelter);
  assert.ok(at(12).microhabitat.lushLift > at(9).microhabitat.lushLift);
  assert.ok(at(3).microhabitat.drySettle > at(7).microhabitat.drySettle);
  assert.equal(at(10).microhabitat.accentBias, 0);
  assert.deepEqual(meadowMicrohabitatWeights({}), Object.values(MEADOW_MICROHABITAT_DEFAULTS));
  assert.equal(at(7).accents.length, 2, 'existing accent species remain');
});

test('microhabitat weights share the existing packed uniform buffer', () => {
  const settings = resolveMeadowGrassConfig(meadow);
  const uniforms = createMeadowUniforms(settings);
  const rows = uniforms.growth.accents.array;
  assert.equal(rows.length, 64, '16 rows each for high, low, species and microhabitat');
  for (const id of [3, 4, 5, 6, 7, 8, 9, 10, 12]) {
    const index = settings.growth.table[id];
    assert.deepEqual(rows[index + 48].toArray(), meadowMicrohabitatWeights(settings.growth.profiles[index]));
  }
});

test('microhabitat settings reject unknown or out-of-range values', () => {
  for (const invalid of [null, [], false, 'wet']) {
    assert.throws(() => resolveMeadowGrowth({ byTileId: { 4: { microhabitat: invalid } } }), /byTileId.4.microhabitat/);
  }
  for (const bad of [
    { lushLift: -0.1 }, { drySettle: 1.01 }, { shelter: Infinity },
    { accentBias: Number.NaN }, { unknown: 0.5 },
  ]) {
    assert.throws(() => resolveMeadowGrowth({ byTileId: { 4: { microhabitat: bad } } }), /byTileId.4.microhabitat/);
  }
  const valid = resolveMeadowMicrohabitat({ shelter: 0.8 });
  assert.deepEqual(valid, { ...MEADOW_MICROHABITAT_DEFAULTS, shelter: 0.8 });
  assert.ok(Object.isFrozen(valid));
});

test('lush areas recover growth, dry areas reduce width, and shelter softens wind', () => {
  const response = { lushLift: 0.65, drySettle: 0.45, shelter: 0.8, accentBias: 0.7 };
  const source = { lush: 0.9, dry: 0, worn: 0 };
  const lush = meadowMicrohabitatNumber(0.35, source, response);
  assert.ok(lush.share > 0.35 && lush.share < 1);
  assert.ok(lush.wind < 1 && lush.wind >= 0.5);
  assert.ok(lush.accentShift > 0 && lush.accentShift <= 0.14);
  const dry = meadowMicrohabitatNumber(0.75, { lush: 0, dry: 1, worn: 0.3 }, response);
  assert.ok(dry.share < 0.75);
  assert.ok(dry.width < 1 && dry.width >= 0.5);
  assert.ok(dry.accentShift < 0);
  const old = meadowMicrohabitatNumber(0.35, source);
  assert.deepEqual(old, { share: 0.35, width: 1, wind: 1, accentShift: 0 });
});

test('20,000 sampled niches preserve height envelopes and valid multipliers', () => {
  const resolved = resolveMeadowGrassConfig(meadow);
  const growth = resolved.growth;
  for (let i = 0; i < 20000; i += 1) {
    const id = [3, 4, 5, 6, 7, 8, 9, 10, 12][i % 9];
    const profile = growth.profiles[growth.table[id]];
    const share = ((i * 1877) % 10007) / 10007;
    const area = {
      lush: ((i * 719) % 10009) / 10009,
      dry: ((i * 101) % 10037) / 10037,
      worn: ((i * 227) % 10039) / 10039,
    };
    const result = meadowMicrohabitatNumber(share, area, profile.microhabitat);
    assert.ok(result.share >= 0 && result.share <= 1);
    assert.ok(result.width >= 0.5 && result.width <= 1);
    assert.ok(result.wind >= 0.5 && result.wind <= 1);
    assert.ok(Math.abs(result.accentShift) <= 0.14);
    assert.ok(Object.values(result).every(Number.isFinite));
    const lower = profile.shortHeight * 0.85;
    const height = lower + (profile.tallHeight - lower) * result.share;
    assert.ok(height >= lower && height <= profile.tallHeight);
  }
});

test('changing one biome microhabitat updates its revision without moving other slots', () => {
  const before = resolveMeadowGrowth(meadow.growth);
  const after = resolveMeadowGrowth({
    ...meadow.growth,
    byTileId: {
      ...meadow.growth.byTileId,
      9: {
        ...meadow.growth.byTileId[9],
        microhabitat: { ...meadow.growth.byTileId[9].microhabitat, shelter: 0.77 },
      },
    },
  });
  const next = reconcileMeadowGrowth(before, after);
  const looks = growth => encodeLookTable(growth.shapes, null, growth.table);
  assert.notEqual(meadowGrowthSignature(before.profiles[before.table[9]]), meadowGrowthSignature(next.profiles[next.table[9]]));
  assert.notEqual(meadowPageGrowthKey(Uint8Array.of(9), before, looks(before)), meadowPageGrowthKey(Uint8Array.of(9), next, looks(next)));
  for (const id of [3, 4, 5, 6, 7, 8, 10, 12]) {
    assert.equal(before.table[id], next.table[id]);
    assert.equal(meadowPageGrowthKey(Uint8Array.of(id), before, looks(before)), meadowPageGrowthKey(Uint8Array.of(id), next, looks(next)));
  }
});

test('near and far rendering reuse the ground area field without new textures', () => {
  const base = new URL('../src/editor/stylized/meadow/', import.meta.url);
  const growth = readFileSync(new URL('meadowGrowthNodes.js', base), 'utf8');
  const plants = readFileSync(new URL('meadowPlantNodes.js', base), 'utf8');
  const blade = readFileSync(new URL('meadowBladeShape.js', base), 'utf8');
  const cards = readFileSync(new URL('meadowCardMaterial.js', base), 'utf8');
  const micro = readFileSync(new URL('meadowMicrohabitat.js', base), 'utf8');
  assert.match(growth, /meadowGroundStyle\(instance.canonical/);
  assert.match(growth, /meadowMicrohabitatShare\(crowned,micro\)/);
  assert.match(plants, /\.add\(micro.accentShift\)/);
  assert.match(growth, /const plant=meadowPlantNodes\(uniforms,instance,micro\)/);
  assert.match(blade, /const plant = profile\.plant/);
  assert.match(cards, /profile\.plant\.height/);
  assert.doesNotMatch(micro, /texture\(|uniformArray\(/);
});
