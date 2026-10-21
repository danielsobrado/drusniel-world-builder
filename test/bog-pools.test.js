import assert from 'node:assert/strict';
import test from 'node:test';
import { BogPools } from '../src/editor/water/BogPools.js';
import { WaterTerrainModel } from '../src/editor/water/WaterTerrainModel.js';
import { resolveWaterDomainConfig } from '../src/editor/water/WaterConfig.js';
import { WATER_BODY_ID_BOG, WATER_KIND_LAKE } from '../src/editor/water/WaterConstants.js';

const config = resolveWaterDomainConfig();
const bogEast = (x) => (x >= 0 ? 12 : 4);

function pools(sampleBaseTile = () => 12) {
  return new BogPools({ seed: 7, config: config.bog, cellSizeMeters: 2, sampleBaseHeight: () => 10, sampleBaseTile });
}

test('a bog is a mix of pools under one level table and islands above it', () => {
  const bog = pools();
  let wet = 0;
  let total = 0;
  for (let z = 0; z < 200; z += 3) for (let x = 0; x < 200; x += 3) {
    const ground = bog.shapeHeight(x, z, 10);
    const water = bog.sample(x, z, ground);
    total += 1;
    if (!water) {
      assert.ok(ground >= bog.level(x, z), 'dry ground stands at or above the table');
      continue;
    }
    wet += 1;
    assert.equal(water.surfaceHeight, 10 - config.bog.tableDrop);
    assert.ok(ground > water.surfaceHeight - config.bog.maximumDepth - 1e-9, 'no pool deeper than maximumDepth');
  }
  const share = wet / total;
  assert.ok(share > 0.15 && share < 0.6, `water share ${share.toFixed(2)} should leave islands and pools`);
});

test('outside a bog the ground and water are untouched, and the bog fades within a lattice step', () => {
  const bog = pools(bogEast);
  const lattice = config.bog.latticeMeters / 2;
  assert.equal(bog.weight(-lattice - 1, 0), 0);
  assert.equal(bog.shapeHeight(-lattice - 1, 0, 3), 3);
  assert.equal(bog.sample(-lattice - 1, 0, -100), null);
  assert.equal(bog.weight(lattice + 1, 0), 1);
});

test('the water model reports bog pools as still lake water and leaves dry probes cheap', () => {
  let heightQueries = 0;
  const model = new WaterTerrainModel({ seed: 7, seaLevel: 0, config,
    sampleBaseHeight: () => { heightQueries += 1; return 10; }, sampleBaseTile: (x) => (x >= 0 ? 12 : 4) });
  assert.equal(model.sampleWaterSurface(-200.5, 3.5), null);
  assert.equal(heightQueries, 0, 'a probe outside the bog never touches the terrain');
  let found = null;
  for (let x = 40; x < 400 && !found; x += 1) {
    const sample = model.sampleWater(x + 0.5, 20.5);
    if (sample.coverage > 0) found = sample;
  }
  assert.ok(found, 'some pool exists along the row');
  assert.equal(found.kind, WATER_KIND_LAKE);
  assert.equal(found.bodyId, WATER_BODY_ID_BOG);
  assert.ok(found.depth > 0);
});
