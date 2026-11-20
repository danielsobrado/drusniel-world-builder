import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWaterField } from '../src/editor/water/WaterField.js';
import {
  createSeaDiffractionSampler, resolveSeaDiffraction,
} from '../src/editor/water/SeaDiffraction.js';
import { seaExposure } from '../src/editor/water/WaterAppearance.js';
import { configureSea, seaSurfaceOffset, updateSeaState } from '../src/editor/water/seaState.js';
import {
  getCanonicalWater, sampleWorldStoreSeaExposure,
} from '../src/editor/water/TerrainWaterQueries.js';

const settings = resolveSeaDiffraction({ enabled: true });

function createSyntheticCoast() {
  let barrier = true;
  const sample = (cellX, cellZ) => {
    const x = cellX * 2, z = -cellZ * 2;
    const land = barrier && x >= 28 && x <= 48 && Math.abs(z) <= 38;
    return {
      kind: land ? 0 : 1, coverage: land ? 0 : 1,
      surfaceHeight: 0, bedHeight: land ? 0 : -2,
      depth: land ? 0 : 2, shoreDistance: 12,
      flowX: 0, flowZ: 0, fall: 0, plunge: 0, flags: 0,
    };
  };
  const world = {
    revision: 1, tileSize: 2,
    getTile: (x, z) => sample(x, z).kind === 1 ? 0 : 2,
    sampleHeight: () => -2,
    heightOverrides: new Map(), tileOverrides: new Map(),
    generator: { sampleWater: sample, seaLevel: 0 },
  };
  return { sample, world, removeBarrier() { barrier = false; world.revision++; } };
}

test('streamed water appearance and CPU gameplay use the same shelter', () => {
  const coast = createSyntheticCoast();
  configureSea({ enabled: true, amplitude: 0.9, stormScale: 1.65,
    choppiness: 4, shallowDepth: 1.5, depthRatio: 0.42,
    surf: { enabled: true, model: 'directionalBreakers', diffraction: settings } });
  try {
    updateSeaState({ timeSeconds: 2.5, storm: 0.2, seaLevel: 0 });
    const field = createWaterField({
      originX: 0, originZ: 0, chunkSize: 1, sampleWater: coast.sample,
      diffraction: settings, tileSizeMeters: 2,
    });
    const exposure = sampleWorldStoreSeaExposure(coast.world, 0, 0, 12);
    assert.ok(Math.abs(exposure - field.appearancePixels[3] / 255) <= 1 / 255);
    const view = { floatingOrigin: {}, worldStore: coast.world };
    const water = getCanonicalWater(view, 0, 0);
    const expectedHeight = seaSurfaceOffset(0, 0, 2, 12, exposure);
    assert.ok(Math.abs(water.surfaceHeight - expectedHeight) < 1e-8);
    assert.equal(field.appearancePixels[0], 1);

    coast.removeBarrier();
    assert.equal(sampleWorldStoreSeaExposure(coast.world, 0, 0, 12), seaExposure(12),
      'terrain revision invalidates cached headland visibility');
  } finally {
    configureSea(null);
  }
});

test('diffraction probes can use bed-free surface sampling without changing the water field', () => {
  let fullSamples = 0, fastSamples = 0;
  const ocean = () => ({ kind: 1, coverage: 1, surfaceHeight: 0,
    bedHeight: -2, depth: 2, shoreDistance: 12 });
  const full = () => { fullSamples++; return ocean(); };
  const surface = () => { fastSamples++; return { kind: 1, coverage: 1 }; };
  const a = createWaterField({ originX: 0, originZ: 0, chunkSize: 16,
    sampleWater: full, diffraction: settings, tileSizeMeters: 2, sampleOceanSurface: surface });
  assert.ok(fastSamples > 0, 'diffraction probes must use the surface-only callback');
  assert.equal(fullSamples, 19 * 19, 'bed samples remain one fixed halo per vertex');
  assert.equal(a.appearancePixels[3], Math.round(seaExposure(12) * 255));
});

test('pages share identical exposure along negative and positive chunk borders', () => {
  const coast = createSyntheticCoast();
  const options = { sampleWater: coast.sample, tileSizeMeters: 2, diffraction: settings };
  for (const originX of [-64, 0, 64]) {
    const a = createWaterField({ ...options, originX, originZ: -32, chunkSize: 32 });
    const b = createWaterField({ ...options, originX: originX + 32, originZ: -32, chunkSize: 32 });
    for (let z = 0; z <= 32; z++) {
      assert.equal(a.appearancePixels[(z * 33 + 32) * 4 + 3],
        b.appearancePixels[z * 33 * 4 + 3]);
    }
  }
});

test('inland appearances and disabled configuration retain the old water path', () => {
  const inland = createWaterField({ originX: 0, originZ: 0, chunkSize: 1,
    sampleWater: () => ({ kind: 2, coverage: 1, surfaceHeight: 0,
      bedHeight: -2, depth: 2, shoreDistance: 12 }),
    diffraction: settings, tileSizeMeters: 2,
  });
  assert.equal(inland.appearancePixels[0], 2);
  assert.equal(inland.appearancePixels[3], 0);
  const sample = () => ({ kind: 1, coverage: 1, surfaceHeight: 0,
    bedHeight: -2, depth: 2, shoreDistance: 12 });
  const plain = createWaterField({ originX: 0, originZ: 0, chunkSize: 1, sampleWater: sample });
  assert.equal(plain.appearancePixels[3], Math.round(seaExposure(12) * 255));
  assert.equal(createSeaDiffractionSampler({ sampleWater: sample, tileSizeMeters: 2,
    settings: { enabled: false } })(0, 0, 12), 1);
});

test('worker configuration flows through the existing water field without an extra texture', async () => {
  const [main, client, generator, appearance] = await Promise.all([
    '../src/main.js', '../src/editor/world/WorldChunkWorkerClient.js',
    '../src/editor/world/generateWorldChunk.js', '../src/editor/stylized/WaterAppearanceNodes.js',
  ].map(async relative => readFile(new URL(relative, import.meta.url), 'utf8')));
  assert.match(main, /seaDiffractionConfig:/);
  assert.match(client, /seaDiffractionConfig: this.seaDiffractionConfig/);
  assert.match(generator, /diffraction: request.seaDiffractionConfig/);
  assert.match(generator, /sampleOceanSurface:/);
  assert.match(appearance, /exposure: filtered.a.clamp\(0, 1\)/);
});
