import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bakeTerrainMaterialPage,
  captureTerrainMaterialBakeSource,
} from '../src/editor/materials/TerrainMaterialBakeCpu.js';
import { floatToHalf } from '../src/editor/materials/HalfFloat.js';
import { createTerrainMaterialBakeDescriptor } from '../src/editor/materials/TerrainMaterialBakeDescriptor.js';

function bakeConfig(resolution = 4) {
  return {
    qualityTiers: { balanced: { resolution } },
    build: { rowsPerYield: 2 },
    classification: {
      rockSlopeStart: 0.18,
      rockSlopeFull: 0.62,
      snowLine: 26,
      snowFade: 8,
      snowSlopeMax: 0.55,
      shorelineRadiusCells: 4,
      wetnessRadiusCells: 2,
    },
    macro: {
      scaleMeters: 120,
      strength: 0.14,
      seedOffset: 2401,
      heightShadeScale: 0.018,
      minHeightShade: 0.72,
      maxHeightShade: 1.22,
      wetDarkening: 0.18,
    },
  };
}

function descriptor() {
  return createTerrainMaterialBakeDescriptor({
    chunkX: 0,
    chunkZ: 0,
    quality: 'balanced',
    revisions: { world: 0, tile: 0, height: 0, water: 0, canopy: 0 },
  });
}

function page(chunkSize = 4) {
  const tilePixels = new Uint8Array(chunkSize * chunkSize * 4);
  const surfaceMaskPixels = new Uint8Array(chunkSize * chunkSize * 4);
  for (let index = 0; index < chunkSize * chunkSize; index += 1) {
    tilePixels.set([90, 140, 70, 4], index * 4);
    surfaceMaskPixels.set([0, 255, 0, 255], index * 4);
  }
  surfaceMaskPixels[2] = 255;
  const heights = new Float32Array((chunkSize + 1) ** 2);
  for (let z = 0; z <= chunkSize; z += 1) {
    for (let x = 0; x <= chunkSize; x += 1) {
      heights[z * (chunkSize + 1) + x] = x * 0.25;
    }
  }
  return {
    originX: 0,
    originZ: 0,
    tilePixels,
    surfaceMaskPixels,
    heights,
  };
}

function options(source, worldSeed = 918273) {
  return {
    source,
    descriptor: descriptor(),
    config: bakeConfig(),
    chunkSize: 4,
    tileSize: 2,
    worldSeed,
    yieldControl: async () => {},
  };
}

test('CPU terrain bake emits the seven packed channels at the configured byte budget', async () => {
  const source = captureTerrainMaterialBakeSource({
    page: page(),
    // RGBA: the canopy lives in R of each texel, with the contact shade in G.
    canopyPixels: new Uint8Array([
      64, 0, 0, 255,
      128, 0, 0, 255,
      192, 0, 0, 255,
      255, 0, 0, 255,
    ]),
    canopySize: 2,
  });
  const result = await bakeTerrainMaterialPage(options(source));

  assert.equal(result.byteLength, 4 * 4 * 22);
  assert.equal(result.value.resolution, 4);
  assert.ok(result.value.channels.macroTint instanceof Uint8Array);
  assert.ok(result.value.channels.terrainShape instanceof Uint16Array);
  assert.ok(result.value.channels.materialWeights instanceof Uint8Array);
  assert.ok(result.value.channels.wetnessShoreline instanceof Uint8Array);
  assert.ok(result.value.channels.farColor instanceof Uint8Array);
  assert.ok(result.value.channels.farNormal instanceof Int8Array);
  assert.ok(result.value.channels.canopyWater instanceof Uint8Array);

  const weights = result.value.channels.materialWeights;
  for (let index = 0; index < 16; index += 1) {
    const offset = index * 4;
    assert.equal(
      weights[offset] + weights[offset + 1] + weights[offset + 2] + weights[offset + 3],
      255,
    );
  }
  assert.equal(result.value.channels.canopyWater[1], 255);
  assert.ok(result.value.channels.wetnessShoreline[0] > 0);
});

test('CPU terrain bake is deterministic for identical source data and world seed', async () => {
  const source = captureTerrainMaterialBakeSource({ page: page() });
  const first = await bakeTerrainMaterialPage(options(source));
  const second = await bakeTerrainMaterialPage(options(source));

  for (const name of Object.keys(first.value.channels)) {
    assert.deepEqual(first.value.channels[name], second.value.channels[name], name);
  }
});

test('different world seeds produce different deterministic macro material fields', async () => {
  const source = captureTerrainMaterialBakeSource({ page: page() });
  const first = await bakeTerrainMaterialPage(options(source, 1001));
  const second = await bakeTerrainMaterialPage(options(source, 2002));

  assert.notDeepEqual(first.value.channels.macroTint, second.value.channels.macroTint);
  assert.notDeepEqual(first.value.channels.farColor, second.value.channels.farColor);
});

test('terrain bake uses full cell gradients on the outer chunk ring', async () => {
  const source = captureTerrainMaterialBakeSource({ page: page() });
  const result = await bakeTerrainMaterialPage(options(source));
  const normals = result.value.channels.farNormal;

  assert.notEqual(normals[0], 0);
  assert.equal(normals[0], normals[(4 - 1) * 2]);
});

test('material-aware far color preserves classified rock instead of reverting to the base tile', async () => {
  const live = page();
  live.surfaceMaskPixels.fill(0);
  for (let index = 0; index < 16; index += 1) {
    live.surfaceMaskPixels[index * 4 + 1] = 255;
    live.surfaceMaskPixels[index * 4 + 3] = 255;
  }
  for (let z = 0; z <= 4; z += 1) {
    for (let x = 0; x <= 4; x += 1) {
      live.heights[z * 5 + x] = x * 4;
    }
  }
  const source = captureTerrainMaterialBakeSource({ page: live });
  const config = bakeConfig();
  config.classification.rockSlopeStart = 0.01;
  config.classification.rockSlopeFull = 0.02;
  config.classification.snowLine = 1000;
  config.macro.strength = 0;
  config.macro.heightShadeScale = 0;
  config.macro.minHeightShade = 1;
  config.macro.maxHeightShade = 1;
  config.render = {
    grassTintStrength: 0,
    wetDarkening: 0,
    shorelineStrength: 0,
    canopyStrength: 0,
    rockColor: '#8d9195',
    snowColor: '#e8eef2',
    shorelineColor: '#59604f',
  };
  const result = await bakeTerrainMaterialPage({
    source,
    descriptor: descriptor(),
    config,
    chunkSize: 4,
    tileSize: 2,
    materialStyle: {
      grassBottomColor: '#4f7c13',
      grassBrightness: 0.8,
      dirtColor: '#ac956c',
      forestColor: '#3b5233',
    },
    yieldControl: async () => {},
  });

  assert.deepEqual([...result.value.channels.materialWeights.slice(0, 4)], [0, 0, 255, 0]);
  assert.deepEqual([...result.value.channels.farColor.slice(0, 3)], [0x8d, 0x91, 0x95]);
});

test('terrain bake source is snapshotted before asynchronous work mutates the live page', () => {
  const live = page();
  const source = captureTerrainMaterialBakeSource({ page: live });
  live.tilePixels[0] = 255;
  live.surfaceMaskPixels[1] = 0;
  live.heights[0] = 99;

  assert.equal(source.tilePixels[0], 90);
  assert.equal(source.surfaceMaskPixels[1], 255);
  assert.equal(source.heights[0], 0);
});

test('curvature reaches the chunk border ring, so a bowl reads the same at every texel', async () => {
  const bowl = page(6);
  for (let z = 0; z <= 6; z += 1) {
    for (let x = 0; x <= 6; x += 1) bowl.heights[z * 7 + x] = 0.5 * x * x;
  }
  const result = await bakeTerrainMaterialPage({ ...options(captureTerrainMaterialBakeSource({ page: bowl })),
    config: bakeConfig(6), chunkSize: 6 });
  const shape = result.value.channels.terrainShape;
  // h = 0.5·x² has a second difference of 1 per cell, over tileSize² = 4.
  const expected = floatToHalf(0.25);
  for (let index = 0; index < 36; index += 1) assert.equal(shape[index * 2 + 1], expected, `texel ${index}`);
});

test('neighbouring chunks bake the same texels along their shared edge', async () => {
  const chunkSize = 4;
  // One continuous world: a slope and a grass/path gradient that both run across the edge.
  const worldPage = (chunkX) => {
    const originX = chunkX * chunkSize;
    const tilePixels = new Uint8Array(chunkSize * chunkSize * 4);
    const surfaceMaskPixels = new Uint8Array(chunkSize * chunkSize * 4);
    for (let z = 0; z < chunkSize; z += 1) {
      for (let x = 0; x < chunkSize; x += 1) {
        const worldX = originX + x;
        const index = z * chunkSize + x;
        tilePixels.set([60 + worldX * 9, 120 + z * 7, 70, 4], index * 4);
        surfaceMaskPixels.set([worldX * 25, 255 - worldX * 28, 0, 255], index * 4);
      }
    }
    const heights = new Float32Array((chunkSize + 1) ** 2);
    for (let z = 0; z <= chunkSize; z += 1) {
      for (let x = 0; x <= chunkSize; x += 1) heights[z * (chunkSize + 1) + x] = (originX + x) ** 2 * 0.08 + z * 0.1;
    }
    return { originX, originZ: 0, tilePixels, surfaceMaskPixels, heights };
  };
  const pages = new Map([[0, worldPage(0)], [1, worldPage(1)]]);
  const bake = async (chunkX) => {
    const source = captureTerrainMaterialBakeSource({
      page: pages.get(chunkX),
      chunkSize,
      pageAt: (cx, cz) => (cz === 0 ? pages.get(cx) ?? null : null),
    });
    const desc = createTerrainMaterialBakeDescriptor({
      chunkX, chunkZ: 0, quality: 'balanced', revisions: { world: 0, tile: 0, height: 0, water: 0, canopy: 0 },
    });
    return (await bakeTerrainMaterialPage({ ...options(source), descriptor: desc, config: bakeConfig(8) })).value;
  };
  const west = await bake(0);
  const east = await bake(1);
  const res = west.resolution;
  for (const [name, pixels] of Object.entries(west.channels)) {
    const components = pixels.length / (res * res);
    for (let z = 0; z < res; z += 1) {
      for (let c = 0; c < components; c += 1) {
        const a = pixels[(z * res + res - 1) * components + c];
        const b = east.channels[name][(z * res) * components + c];
        assert.equal(a, b, `${name}[${c}] row ${z}: west edge ${a} vs east edge ${b}`);
      }
    }
  }
});
