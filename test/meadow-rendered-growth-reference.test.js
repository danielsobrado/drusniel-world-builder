import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'js-yaml';

import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { meadowGrowthHeight } from '../src/editor/stylized/meadow/meadowGrowthMath.js';
import { meadowGrowthSignature as directGrowthSignature } from '../src/editor/stylized/meadow/meadowGrowthProfiles.js';
import { meadowGrowthSignature as updatedGrowthSignature } from '../src/editor/stylized/meadow/MeadowGrowthUpdates.js';
import { MEADOW_STAND_MAX_HEIGHT } from '../src/editor/stylized/meadow/meadowStandNodes.js';
import { MEADOW_CARD_HEIGHT_CONTRAST, MEADOW_CARD_STATURE } from '../src/editor/stylized/meadow/meadowTuftField.js';
import {
  meadowAreaStyleReference, meadowRenderedHeightReference, meadowSpeciesHeightReference,
} from './helpers/meadow-growth-reference.js';

const yaml = load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));
const settings = resolveMeadowGrassConfig(yaml.stylizedSurface.grass.meadow);
const active = [3, 4, 5, 6, 7, 8, 9, 10, 12];
const at = id => settings.growth.profiles[settings.growth.table[id]];

test('lush and dry masks are monotonic with defined smoothstep edges', () => {
  const shader = readFileSync(new URL('../src/editor/stylized/meadow/meadowGroundStyle.js', import.meta.url), 'utf8');
  const species = readFileSync(new URL('../src/editor/stylized/meadow/meadowStandNodes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(shader, /smoothstep\(0\.5, 0\.3,/);
  assert.doesNotMatch(species, /smoothstep\(0\.42, 0\.3,/);
  assert.match(shader, /oneMinus\(smoothstep\(0\.3, 0\.5, area\)\)/);
  assert.match(species, /oneMinus\(smoothstep\(0\.3, 0\.42, drift\)\)/);
});

test('lush, dry and worn masks keep their fractions and height multiplier bounded', () => {
  let lush = 0, dry = 0;
  for (let i = 0; i < 4000; i += 1) {
    const x = -5600 + i * 0.43;
    const z = 8700 - i * 0.27;
    const area = meadowAreaStyleReference(x, z, 1);
    for (const key of ['lush', 'dry', 'worn']) {
      assert.ok(area[key] >= 0 && area[key] <= 1, `${key} at ${x}, ${z}`);
    }
    assert.ok(area.height >= 0.86 * 0.72 && area.height <= 1);
    lush += area.lush;
    dry += area.dry;
    assert.deepEqual(meadowAreaStyleReference(x, z, 0), { lush: 0, dry: 0, worn: 0, height: 1 });
  }
  assert.ok(lush > 0 && dry > 0, 'both ground-style regimes must remain reachable');
});

test('species height keeps the maximum physical-growth bound under extreme seed weights', () => {
  for (let i = 0; i < 5000; i += 1) {
    const x = -2000 + i * 0.31, z = 6000 - i * 0.39;
    const rank = i % 1000;
    const s = meadowSpeciesHeightReference(x, z, rank, { rye: 2, fescue: 2, cover: 2, seeds: 2 });
    assert.ok(s.height >= 0.62 * 0.82 - 1e-10, 'low-cover/fescue cannot go negative');
    assert.ok(s.height <= MEADOW_STAND_MAX_HEIGHT + 1e-10, 'species envelope must cover seed stems');
  }
});

test('neutral microhabitat reduces to the base height model when style is off', () => {
  for (const id of active) {
    const profile = at(id);
    for (let i = 0; i < 300; i += 1) {
      const x = -500 + i * 0.73;
      const z = 800 - i * 0.89;
      const rendered = meadowRenderedHeightReference(profile, x, z, {
        rank: i, areaStrength: 0, tuftSettings: settings.tufts,
      });
      const base = meadowGrowthHeight(
        { ...profile, shape: rendered.effectiveShape },
        x, z, false, settings.tufts.height, settings.tufts.moundHeight,
      );
      assert.ok(rendered.height >= 0);
      const expected = base * rendered.stand.height * rendered.accentHeight * rendered.gap;
      assert.ok(Math.abs(rendered.height - expected) < 1e-10, `biome ${id}: ${rendered.height} vs ${expected}`);
    }
  }
});

test('near blades and far cards remain inside species and accent height envelopes', () => {
  for (const id of active) {
    const profile = at(id);
    const accentMax = Math.max(1, ...(profile.accents ?? []).map(plant => plant.height));
    for (let i = 0; i < 350; i += 1) {
      const x = -30000 + i * 0.77, z = 12000 + i * 0.43;
      for (const cards of [false, true]) {
        const result = meadowRenderedHeightReference(profile, x, z, {
          rank: i, cards, tuftSettings: settings.tufts,
          areaStrength: settings.appearance.groundStyle,
        });
        const bound = profile.tallHeight * accentMax * (cards ? MEADOW_CARD_STATURE : MEADOW_STAND_MAX_HEIGHT);
        assert.ok(result.height >= 0 && result.height <= bound + 1e-9,
          `biome ${id}: ${result.height} over ${bound}`);
        assert.ok(result.micro.share >= 0 && result.micro.share <= 1);
        assert.ok(result.gap >= 0 && result.gap <= 1);
      }
    }
  }
});

test('far cards compress growth contrast while following the same ecological masks', () => {
  const profile = at(4);
  for (let i = 0; i < 600; i += 1) {
    const x = 910 + i * 0.91, z = -320 - i * 0.57;
    const near = meadowRenderedHeightReference(profile, x, z, { rank: i, tuftSettings: settings.tufts });
    const far = meadowRenderedHeightReference(profile, x, z, { rank: i, cards: true, tuftSettings: settings.tufts });
    assert.deepEqual(near.area, far.area);
    assert.equal(far.share, 0.5 + (near.share - 0.5) * MEADOW_CARD_HEIGHT_CONTRAST);
    assert.equal(far.gap, 1);
  }
});

test('tuft settings reject malformed types and misspelled keys', () => {
  for (const tufts of [null, [], 1, 'clump', { moundHieght: 0.2 }, { enabled: 1 }]) {
    assert.throws(() => resolveMeadowGrassConfig({ tufts }), /meadow\.tufts/);
  }
  assert.equal(resolveMeadowGrassConfig({ tufts: { enabled: false } }).tufts.moundHeight, 0);
  assert.equal(resolveMeadowGrassConfig({ tufts: { moundHeight: 0.6 } }).tufts.moundHeight, 0.6);
});

test('the live-update signature is the same function used by profile deduplication', () => {
  assert.equal(updatedGrowthSignature, directGrowthSignature);
  for (const id of active) {
    const profile = at(id);
    assert.equal(updatedGrowthSignature(profile), directGrowthSignature(profile));
    assert.notEqual(directGrowthSignature(profile), directGrowthSignature({
      ...profile, microhabitat: { ...profile.microhabitat, shelter: 0.99 },
    }));
  }
});

test('the shader clamps gust texture values before amplifying wind or flutter', () => {
  const nodes = readFileSync(new URL('../src/editor/stylized/meadow/meadowWindNodes.js', import.meta.url), 'utf8');
  assert.equal(nodes.split('wind.gust.clamp(0, 1)').length - 1, 2);
});

test('accent reeds and broad leaves keep their own silhouette and mound posture', () => {
  const source = new URL('../src/editor/stylized/meadow/', import.meta.url);
  const growth = readFileSync(new URL('meadowGrowthNodes.js', source), 'utf8');
  const shape = readFileSync(new URL('meadowBladeShape.js', source), 'utf8');
  const cards = readFileSync(new URL('meadowCardMaterial.js', source), 'utf8');
  assert.ok(growth.includes('moundStrength=plant.shape.lessThan'));
  assert.ok(shape.includes('shoulder = profile.tuft.shoulder.mul(plant.shape'));
  assert.ok(cards.includes('cardPlant.assign(profile.plant.shape'));

  const profile = at(4);
  let different = 0;
  for (let i = 0; i < 4000; i += 1) {
    const x = -2000 + i * 0.39, z = 1000 + i * 0.23;
    const rendered = meadowRenderedHeightReference(profile, x, z, { rank: i, tuftSettings: settings.tufts });
    if (rendered.effectiveShape === 'slender') continue;
    const original = meadowGrowthHeight(profile, x, z, false, settings.tufts.height, settings.tufts.moundHeight);
    const actual = meadowGrowthHeight(
      { ...profile, shape: rendered.effectiveShape }, x, z,
      false, settings.tufts.height, settings.tufts.moundHeight,
    );
    if (Math.abs(actual - original) > 0.001) different += 1;
  }
  assert.ok(different > 0, 'accent plants would otherwise inherit grass mounds');
});
