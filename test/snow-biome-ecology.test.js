import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { ForestSpeciesRegistry } from '../src/editor/stylized/forest/ForestSpeciesRegistry.js';
import { createSpeciesPrototypeIndex } from '../src/editor/stylized/forest/ForestSpeciesGeometry.js';
import { ForestHabitatField } from '../src/editor/stylized/forest/ForestHabitatField.js';
import { DEFAULT_WEATHER_EFFECTS, resolveWeatherEffects } from '../src/editor/weather/WeatherEffectsConfig.js';

const surface = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8')).stylizedSurface;

test('shipped cold biome palettes always pick snowy alpine crowns and keep generic conifers elsewhere', () => {
  const variants = surface.assets.treeVariants.filter(variant => variant.scene.includes('/alpine/'));
  const additional = new Map(), allowed = new Map(), preferred = new Map();
  variants.forEach((variant, i) => {
    const index = i + 2;
    for (const species of [].concat(variant.species)) additional.set(species, [...(additional.get(species) ?? []), index]);
    allowed.set(index, new Set(variant.tileIds));
    preferred.set(index, new Set(variant.preferredTileIds));
  });
  const registry = new ForestSpeciesRegistry({ prototypeCount: 4,
    prototypeIndexBySpecies: createSpeciesPrototypeIndex({ glbPrototypeCount: 2, generatedSpeciesIds: [],
      additionalPrototypeIndicesBySpecies: additional }), prototypeTileIds: allowed, prototypePreferredTileIds: preferred });
  for (const [tileId, profileKey] of [[9, 'taiga'], [10, 'tundra']]) {
    for (let i = 0; i < 200; i++) {
      const candidate = { stableId: `snow:${i}`, scale: 1 };
      const habitat = { tileId, profileKey, patchCoverage: 0.8, patchEdge: 0.2, slope: 0.1, waterWeight: 1 };
      const record = registry.select(candidate, habitat);
      assert.ok(record.prototypeIndex >= 2, 'a generic green conifer entered snow country');
      assert.deepEqual(registry.select(candidate, habitat), record, 'selection is deterministic');
    }
  }
  assert.deepEqual(registry.prototypesFor('conifer_narrow', 8), [0, 1]);
  assert.deepEqual(registry.prototypesFor('conifer_wide', 8), [0, 1]);
  assert.deepEqual(registry.prototypesFor('conifer_narrow'), [0, 1, 2, 3]);
});

test('alpine profiles permit sparse mountain trees and fade out before bare glacier', () => {
  let tile = 10, height = 500;
  const field = new ForestHabitatField({ tileSize: 2, tileAt: () => tile, heightAt: () => height,
    config: surface.trees.habitat });
  assert.equal(field.sampleCoarse(0, 0).elevationWeight, 1);
  height = 660;
  assert.ok(Math.abs(field.sampleCoarse(0, 0).elevationWeight - 0.5) < 1e-9);
  height = 700;
  assert.equal(field.sampleCoarse(0, 0).suitability, 0);
  tile = 11; height = 500;
  assert.equal(field.sampleCoarse(0, 0).suitability, 0);
});

test('authored snowfall matches reference coverage tuning and rejects inverted coverage bands', () => {
  const source = yaml.load(readFileSync(new URL('../config/weather-effects.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(resolveWeatherEffects(source), DEFAULT_WEATHER_EFFECTS);
  assert.throws(() => resolveWeatherEffects({ snowfall: { regionalFullCoverage: 0.1 } }), /must exceed/);
  assert.throws(() => resolveWeatherEffects({ snowfall: { regionalFadeRate: 0 } }), /regionalFadeRate/);
});
