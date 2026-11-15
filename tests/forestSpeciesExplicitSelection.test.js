import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOREST_AGE_CLASSES,
  FOREST_SPECIES_DEFAULTS,
  ForestSpeciesRegistry,
} from '../src/editor/stylized/forest/ForestSpeciesRegistry.js';

const HABITAT = Object.freeze({
  profileKey: 'grassland',
  patchId: 'test-patch',
  patchEdge: 0,
  patchCoverage: 1,
  slope: 0,
  waterWeight: 0,
  riparian: 0,
  tileId: null,
});

function createRegistry() {
  return new ForestSpeciesRegistry({
    prototypeCount: 2,
    prototypeIndexBySpecies: {
      map: new Map([
        ['broadleaf_round', [0]],
        ['conifer_narrow', [1]],
      ]),
      fallback: [0],
    },
  });
}

test('explicit planted species controls prototype and species morphology', () => {
  const selected = createRegistry().select({
    stableId: 'planted:conifer',
    scale: 1,
    speciesId: 'conifer_narrow',
    ageClass: 'sapling',
  }, HABITAT);

  assert.equal(selected.speciesId, 'conifer_narrow');
  assert.equal(selected.prototypeIndex, 1);
  assert.ok(selected.instanceMorphology);
  assert.equal(
    selected.crownAspect,
    FOREST_SPECIES_DEFAULTS.conifer_narrow.crownAspect
      * selected.instanceMorphology.crownFlattening,
  );
  assert.equal(selected.speciesColor, FOREST_SPECIES_DEFAULTS.conifer_narrow.color);
});

test('explicit planted age controls every derived age dimension', () => {
  const registry = createRegistry();
  const base = {
    stableId: 'planted:age',
    scale: 1,
    speciesId: 'conifer_narrow',
  };
  const sapling = registry.select({ ...base, ageClass: 'sapling' }, HABITAT);
  const mature = registry.select({ ...base, ageClass: 'mature' }, HABITAT);
  const saplingAge = FOREST_AGE_CLASSES.sapling;
  const matureAge = FOREST_AGE_CLASSES.mature;
  const same = (a, b) => Math.abs(a - b) < 1e-12;

  assert.equal(sapling.ageClass, 'sapling');
  assert.equal(mature.ageClass, 'mature');
  assert.ok(same(sapling.heightScale / saplingAge.height, mature.heightScale / matureAge.height));
  assert.ok(same(sapling.trunkScale / saplingAge.trunk, mature.trunkScale / matureAge.trunk));
  assert.ok(same(sapling.crownScale / saplingAge.crown, mature.crownScale / matureAge.crown));
  assert.equal(sapling.crownHeightScale, saplingAge.crownHeight);
  assert.ok(Math.abs(
    sapling.spacingRadius / (saplingAge.spacing * sapling.crownScale)
      - FOREST_SPECIES_DEFAULTS.conifer_narrow.spacing,
  ) < 1e-12);
});

test('unknown explicit values fall back to deterministic ecological selection', () => {
  const selected = createRegistry().select({
    stableId: 'planted:invalid',
    scale: 1,
    speciesId: 'missing-species',
    ageClass: 'seedling',
  }, HABITAT);

  assert.ok(['broadleaf_round', 'broadleaf_tall'].includes(selected.speciesId));
  assert.ok(Object.hasOwn(FOREST_AGE_CLASSES, selected.ageClass));
});
