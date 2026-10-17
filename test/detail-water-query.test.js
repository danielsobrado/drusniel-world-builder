import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDetailSurfacePlacement } from '../src/editor/stylized/DetailSurfacePlacement.js';
import { evaluateAquaticPlacement } from '../src/editor/water/AquaticPlacement.js';
import { WaterTerrainModel } from '../src/editor/water/WaterTerrainModel.js';
import { resolveWaterDomainConfig } from '../src/editor/water/WaterConfig.js';
import { createWaterSample } from '../src/editor/water/WaterSample.js';
import { SHORE_HABITATS } from '../src/editor/stylized/shoreHabitat.js';

const candidate = { x: -.4, z: -.6, height: .3, prototypeIndex: 0 };
const aquatic = terrainView => ({ terrainView, layerName: 'aquaticPlant', config: {},
  layerConfig: { water: { placement: 'rooted', maximumDepth: 4, maximumCurrent: 1 } },
  prototypeWaterRules: [null] });

test('dry aquatic candidates reject without a bed query, including an erased river', () => {
  for (const river of [false, true]) {
    const model = new WaterTerrainModel({ seed: 3, seaLevel: 0, config: resolveWaterDomainConfig(),
      sampleBaseHeight: () => assert.fail('dry rejection must not interpolate the bed'), sampleBaseTile: () => 4 });
    if (river) model.riverChannel = { sample: () => ({ bodyId: 1025, coverage: 1,
      surfaceHeight: 4, flowX: 1, flowZ: 0, shoreDistance: 2 }) };
    const worldStore = { tileSize: 2, getTile: () => 4,
      sampleHeight: () => assert.fail('dry rejection must not query edited height'),
      tileOverrides: new Map(river ? [['-1:0', 4]] : []),
      generator: { seaLevel: 0, sampleWater: (x, z) => model.sampleWater(x, z),
        sampleWaterSurface: (x, z) => model.sampleWaterSurface(x, z) } };
    const view = aquatic({ worldStore, getCanonicalWater: () => assert.fail('dry rejection must not request a full sample') });
    assert.equal(evaluateDetailSurfacePlacement(view, candidate, () => .3), null);
  }
});

test('wet aquatic candidates retain canonical bed, identity, current and depth rejection', () => {
  for (const kind of [1, 2, 3]) for (const flowX of [0, .8, 2]) for (const bedHeight of [.3, -8]) {
    const sample = createWaterSample({ kind, bodyId: kind * 1024, coverage: .8,
      surfaceHeight: 3.45, bedHeight, shoreDistance: 4, flowX, flowZ: -.2 });
    let completeQueries = 0;
    const view = aquatic({ worldStore: { tileSize: 2, getTile: () => 0, sampleHeight: () => bedHeight,
      generator: { seaLevel: 0, sampleWater: () => sample,
        sampleWaterSurface: () => ({ ...sample, surfaceHeight: 3 }) } },
    getCanonicalWater: () => { completeQueries++; return sample; } });
    assert.deepEqual(evaluateDetailSurfacePlacement(view, candidate, () => .3),
      evaluateAquaticPlacement({ waterSample: sample, layerRule: view.layerConfig.water }));
    assert.equal(completeQueries, 1, 'the identity shortcut never replaces the wet canonical sample');
  }
});

test('shore contact shortcut preserves clustered placement and slope metadata', () => {
  const sample = { kind: 0, coverage: 0, bedHeight: .3 };
  let beds = 0;
  const generator = { seaLevel: 0, sampleWater: () => { beds++; return sample; } };
  const worldStore = { tileSize: 2, getTile: () => 4, sampleHeight: () => .3,
    heightOverrides: new Map(), generator };
  const view = { layerName: 'shoreLife', terrainView: { worldStore },
    config: {}, layerConfig: {}, prototypeStrandRules: [{ minimumAbove: 0, maximumAbove: 1 }],
    prototypeShoreRules: [SHORE_HABITATS.starfish], oceanDistance: { worldDistanceAt: () => 2 } };
  const heightAt = x => .3 + x * .1;
  const candidates = Array.from({ length: 100 }, (_, x) => ({ ...candidate, x }));
  const expected = candidates.map(c => evaluateDetailSurfacePlacement(view, c, heightAt));
  assert.ok(expected.some(Boolean) && expected.some(value => value === null));
  assert.ok(beds > 0);
  generator.sampleWaterSurface = () => null;
  beds = 0;
  assert.deepEqual(candidates.map(c => evaluateDetailSurfacePlacement(view, c, heightAt)), expected);
  assert.equal(beds, 0);
});
