import assert from 'node:assert/strict';
import test from 'node:test';
import { flowerColony } from '../src/editor/stylized/FlowerColonies.js';
import { resolveFlowerPalette } from '../src/editor/stylized/FlowerPalette.js';
import { buildFlowerScatter, createVegetationScatterConfig, enrichPageVegetationScatter } from '../src/editor/stylized/vegetationScatter.js';

test('colony coverage is continuous across cells at large world coordinates', () => {
  const settings = { enabled: true, patchMeters: 18 };
  for (const offset of [0, 1000000, -7000000]) {
    const left = flowerColony(offset + 18 - .00001, 36, settings);
    const right = flowerColony(offset + 18 + .00001, 36, settings);
    assert.ok(Math.abs(left.coverage - right.coverage) < .00001);
    assert.ok(left.coverage >= 0 && left.coverage <= 1);
    assert.deepEqual(left, flowerColony(offset + 18 - .00001, 36, settings));
  }
  assert.deepEqual(flowerColony(10, 20), { coverage: 1, variety: null });
  assert.throws(() => flowerColony(0, 0, { enabled: true, patchMeters: 0 }), /patchMeters/);
});

test('worker and main flower scatter share colonies, eligibility and deterministic variants', () => {
  const chunkSize = 32;
  const page = { chunkX: -17, chunkZ: 23, tiles: new Uint8Array(chunkSize ** 2).fill(4),
    heights: new Float32Array((chunkSize + 1) ** 2) };
  const flowers = { enabled: true, perChunk: 480, tileIds: [4], minSize: .4, maxSize: .6,
    colonies: { enabled: true, patchMeters: 18 } };
  const config = createVegetationScatterConfig({ enabled: true, flowers }, 2);
  enrichPageVegetationScatter(page, config);
  const main = buildFlowerScatter({ page, chunkSize, tileSize: 2, sampleLimit: 480, ...flowers });
  assert.deepEqual(main, page.flowerScatter);
  assert.ok(main.count > 0 && main.count < 480, 'quiet ground separates colonies');
  flowers.colonies.patchMeters = 32;
  assert.equal(config.flowers.colonies.patchMeters, 18, 'worker config is a snapshot');
  const empty = buildFlowerScatter({ page, chunkSize, tileSize: 2, sampleLimit: 480, ...flowers, tileIds: [12] });
  assert.equal(empty.count, 0);
});

test('flower palettes keep explicit custom IDs and reject malformed colors', () => {
  const config = { flowers: { colorR: '#9988aa', colorG: '#bbaa77', colorB: '#8888bb',
    byTileId: { 32: { colorR: '#cc9988' } } } };
  assert.notDeepEqual(resolveFlowerPalette(config, 32)[0], resolveFlowerPalette(config, 4)[0]);
  assert.deepEqual(resolveFlowerPalette(config, 32)[1], resolveFlowerPalette(config, 4)[1]);
  config.flowers.byTileId[32].colorR = 'pink';
  assert.throws(() => resolveFlowerPalette(config, 32), /Invalid flower palette/);
});
