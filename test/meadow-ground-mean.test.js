import assert from 'node:assert/strict';
import test from 'node:test';
import { meadowGroundMean } from '../src/editor/stylized/meadow/meadowGroundMean.js';
import { createMeadowGroundPalette } from '../src/editor/stylized/meadow/meadowGroundPalette.js';
import { forestFloorDensity, validateForestFloorDensities } from '../src/editor/stylized/forest/ForestFloor.js';
import { terrainSubstrateWeights } from '../src/editor/materials/TerrainSubstrateMath.js';

test('soil and litter form the persistent ground palette, including custom biomes', () => {
  const config = { dirt: { color: '#63513d' }, grass: { system: 'meadow', meadow: {
    palette: { base: '#50852b', tip: '#a6bf65' }, groundDetail: { byTileId: { 32: { litter: '#554433', litterAmount: 1 } } },
  } } };
  const on = createMeadowGroundPalette(config);
  config.grass.meadow.groundDetail.enabled = false;
  const off = createMeadowGroundPalette(config);
  assert.notDeepEqual([...on.roots.slice(32 * 3, 32 * 3 + 3)], [...on.roots.slice(4 * 3, 4 * 3 + 3)]);
  assert.notDeepEqual([...on.roots], [...off.roots]);
  const root = [.2, .3, .1];
  assert.deepEqual(meadowGroundMean(root, [0, 0, 0], [1, 1, 1, 0], [0, 0, 0]), root);
  assert.deepEqual(meadowGroundMean(root, [0, 0, 0], [1, 1, 1, 1], [1, 1, 1], 0), root);
});

test('habitat floor overrides preserve edges and respect zero rather than replacing it with a default', () => {
  const config = { grassCoreDensity: .28, grassEdgeDensity: .78, byTileId: { 7: { grassCoreDensity: 0 } } };
  const core = { patchId: 'grove', patchCoverage: 1, patchEdge: 0, tileId: 7 };
  assert.equal(forestFloorDensity(core, 'grass', config), 0);
  assert.equal(forestFloorDensity({ ...core, tileId: 6 }, 'grass', config), .28);
  assert.equal(forestFloorDensity({ ...core, patchCoverage: 0 }, 'grass', config), 1);
  assert.equal(forestFloorDensity({ ...core, patchEdge: 1 }, 'grass', config), .78);
  validateForestFloorDensities(config);
  assert.throws(() => validateForestFloorDensities({ byTileId: { 7: { grassCoreDensity: 2 } } }), /must be in/);
});

test('cold deserts retain mineral substrate while hot deserts retain sand', () => {
  assert.equal(terrainSubstrateWeights({ tileId: 1 }).sand, 1);
  assert.equal(terrainSubstrateWeights({ tileId: 2 }).mineral, 1);
});

test('stand occlusion follows habitat density in the persistent substrate, including custom IDs', () => {
  const config = { grass: { system: 'meadow', meadow: {
    palette: { base: '#50852b', tip: '#a6bf65' }, groundDetail: { enabled: false },
    appearance: { groundOcclusion: .2 },
    growth: { byTileId: { 32: { density: 0 }, 33: { density: 1 } } },
  } } };
  const { roots } = createMeadowGroundPalette(config);
  for (let c = 0; c < 3; c++) {
    assert.ok(roots[32 * 3 + c] > roots[33 * 3 + c]);
    assert.ok(Math.abs(roots[33 * 3 + c] / roots[32 * 3 + c] - .8) < 1e-6);
  }
});
