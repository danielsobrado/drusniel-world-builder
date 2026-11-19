import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'js-yaml';

import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { resolveMeadowGrowth } from '../src/editor/stylized/meadow/meadowGrowthProfiles.js';
import { meadowGrowthSignature, meadowPageGrowthKey, reconcileMeadowGrowth } from '../src/editor/stylized/meadow/MeadowGrowthUpdates.js';
import { encodeLookTable } from '../src/editor/stylized/meadow/meadowPalettes.js';
import { MEADOW_STAND_DEFAULT, meadowStandWeights } from '../src/editor/stylized/meadow/meadowStandProfiles.js';
import { createMeadowUniforms } from '../src/editor/stylized/meadow/meadowUniforms.js';

const meadow = load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'))
  .stylizedSurface.grass.meadow;

test('biome stands keep distinct plant communities without extra geometry profiles', () => {
  const settings = resolveMeadowGrassConfig(meadow);
  const growth = settings.growth;
  const at = id => growth.profiles[growth.table[id]];
  assert.ok(growth.profiles.length <= 16);
  assert.ok(at(3).stand.rye > at(9).stand.rye, 'savanna favors coarse tall grass');
  assert.ok(at(3).stand.seeds > at(9).stand.seeds, 'savanna has dry seed heads');
  assert.ok(at(9).stand.fescue > at(3).stand.fescue, 'taiga favors fine short grass');
  assert.equal(at(7).stand.rye, 0, 'tropical floor has no rye');
  assert.equal(at(7).stand.seeds, 0, 'broadleaf floor has no straw seed stems');
  assert.deepEqual(meadowStandWeights(at(12)), [0, 0, 0, 0], 'sedge reeds retain their own shape');
  assert.equal(at(4).accents.length, 2, 'existing accent plants are preserved');
  assert.deepEqual(meadowStandWeights({}), Object.values(MEADOW_STAND_DEFAULT));
});

test('stand weights use the existing packed accent uniform buffer', () => {
  const settings = resolveMeadowGrassConfig(meadow);
  const uniforms = createMeadowUniforms(settings);
  assert.equal(uniforms.growth.accents.array.length, 48, 'one array, no extra uniform buffer');
  for (const id of [3, 4, 5, 7, 9, 10, 12]) {
    const index = settings.growth.table[id];
    const row = uniforms.growth.accents.array[index + 32];
    assert.deepEqual(row.toArray(), meadowStandWeights(settings.growth.profiles[index]));
  }
});

test('stand configuration rejects malformed weights without changing growth', () => {
  const growth = resolveMeadowGrowth({ byTileId: { 4: { stand: { fescue: 1.5 } } } });
  assert.deepEqual(meadowStandWeights(growth.profiles[0]), [1, 1.5, 1, 1]);
  assert.equal(growth.profiles[0].shortHeight, 0.24);
  assert.equal(growth.profiles[0].tallHeight, 0.82);
  for (const stand of [{ rye: -0.01 }, { cover: 2.01 }, { seeds: Infinity }, { unknown: 1 }, null, []]) {
    assert.throws(
      () => resolveMeadowGrowth({ byTileId: { 4: { stand } } }),
      /byTileId.*stand/,
    );
  }
});

test('community-only live edits invalidate only affected biome pages', () => {
  const before = resolveMeadowGrowth(meadow.growth);
  const after = resolveMeadowGrowth({
    ...meadow.growth,
    byTileId: {
      ...meadow.growth.byTileId,
      9: { ...meadow.growth.byTileId[9], stand: { ...meadow.growth.byTileId[9].stand, fescue: 1.8 } },
    },
  });
  const remapped = reconcileMeadowGrowth(before, after);
  const oldLooks = encodeLookTable(before.shapes, null, before.table);
  const newLooks = encodeLookTable(remapped.shapes, null, remapped.table);
  assert.notEqual(meadowGrowthSignature(before.profiles[before.table[9]]), meadowGrowthSignature(remapped.profiles[remapped.table[9]]));
  assert.notEqual(meadowPageGrowthKey(Uint8Array.of(9), before, oldLooks), meadowPageGrowthKey(Uint8Array.of(9), remapped, newLooks));
  for (const biome of [3, 4, 5, 7, 10, 12]) {
    assert.equal(before.table[biome], remapped.table[biome], `biome ${biome} retains its slot`);
    assert.equal(meadowPageGrowthKey(Uint8Array.of(biome), before, oldLooks), meadowPageGrowthKey(Uint8Array.of(biome), remapped, newLooks));
  }
});
