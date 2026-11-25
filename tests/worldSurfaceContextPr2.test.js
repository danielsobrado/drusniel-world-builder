import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import {
  TERRAIN_SURFACE_CONSTANTS,
  WorldSurfaceContextField,
  clearWorldSurfaceContext,
  createTerrainSurfaceEvaluator,
  sampleWorldSurfaceContextCpu,
} from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContextField.js';
import { createTerrainMaterialBakeConfig } from '../src/editor/materials/TerrainMaterialBakeConfig.js';

function loadStylizedConfig() {
  const editorCfg = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));
  const bakeCfg = yaml.load(readFileSync(new URL('../config/terrain-material-bake.yaml', import.meta.url), 'utf8'));
  return {
    ...editorCfg.stylizedSurface,
    materialBake: createTerrainMaterialBakeConfig(bakeCfg),
  };
}

function makeRichSlot({
  chunkX = 0,
  chunkZ = 0,
  chunkSize = 16,
  tileSize = 2,
  tileId = 4,
  tileSrgb = [90, 120, 62],
  height = 18,
  cellSetup = null,
  materialBake = null,
}) {
  const heights = new Float32Array((chunkSize + 1) * (chunkSize + 1)).fill(height);
  const tiles = new Uint8Array(chunkSize * chunkSize).fill(tileId);
  const tilePixels = new Uint8Array(chunkSize * chunkSize * 4);
  const surfaceMaskPixels = new Uint8Array(chunkSize * chunkSize * 4);
  const forestFloorSize = chunkSize;
  const forestFloorPixels = new Uint8Array(forestFloorSize * forestFloorSize * 4);

  for (let z = 0; z < chunkSize; z += 1) {
    for (let x = 0; x < chunkSize; x += 1) {
      const i = z * chunkSize + x;
      const o = i * 4;
      const custom = cellSetup ? cellSetup(x, z) : null;
      const tid = custom?.tileId ?? tileId;
      const rgb = custom?.tileSrgb ?? tileSrgb;
      tiles[i] = tid;
      tilePixels[o] = rgb[0];
      tilePixels[o + 1] = rgb[1];
      tilePixels[o + 2] = rgb[2];
      tilePixels[o + 3] = tid;

      surfaceMaskPixels[o] = Math.round((custom?.path ?? 0) * 255);
      surfaceMaskPixels[o + 1] = Math.round((custom?.grass ?? 1) * 255);
      surfaceMaskPixels[o + 2] = Math.round((custom?.water ?? 0) * 255);
      surfaceMaskPixels[o + 3] = 255;

      forestFloorPixels[o] = Math.round((custom?.canopy ?? 0) * 255);
      forestFloorPixels[o + 1] = Math.round((custom?.contact ?? 0) * 255);
      forestFloorPixels[o + 2] = Math.round((custom?.litter ?? 0) * 255);
      forestFloorPixels[o + 3] = 255;
    }
  }

  return {
    descriptor: {
      key: `${chunkX}:${chunkZ}`,
      chunkX,
      chunkZ,
      originCellX: chunkX * chunkSize,
      originCellZ: chunkZ * chunkSize,
    },
    page: { heights, tiles, tilePixels, surfaceMaskPixels },
    forestFloorPixels,
    forestFloorSize,
    forestFloorKey: 'ff-rich',
    materialBake,
    pageRevision: 1,
    loading: false,
  };
}

function makeBake({ res = 16, weights = [255, 0, 0, 0], wetness = 0, shoreline = 0, macro = [128, 128, 128], key = 'bake-v1' }) {
  const n = res * res;
  const materialWeights = new Uint8Array(n * 4);
  const wetnessShoreline = new Uint8Array(n * 2);
  const macroTint = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    materialWeights[i * 4] = weights[0];
    materialWeights[i * 4 + 1] = weights[1];
    materialWeights[i * 4 + 2] = weights[2];
    materialWeights[i * 4 + 3] = weights[3];
    wetnessShoreline[i * 2] = wetness;
    wetnessShoreline[i * 2 + 1] = shoreline;
    macroTint[i * 4] = macro[0];
    macroTint[i * 4 + 1] = macro[1];
    macroTint[i * 4 + 2] = macro[2];
    macroTint[i * 4 + 3] = 255;
  }
  return {
    descriptor: { key },
    resolution: res,
    channels: { materialWeights, wetnessShoreline, macroTint },
  };
}

test('PR 2 TerrainSurfaceEvaluator distinguishes grass turf, dirt road, forest moss, rock, snow, and wetness', () => {
  const stylized = loadStylizedConfig();
  const evaluator = createTerrainSurfaceEvaluator(stylized);
  assert.equal(evaluator.hasMeadowPalette, true);

  const grass = evaluator.evaluate({
    tileId: 4, tileR: 0.1, tileG: 0.2, tileB: 0.05, height: 15, grassCoverage: 1, pathMask: 0,
    bakeSample: { grassWeight: 1, dirtWeight: 0, rockWeight: 0, snowWeight: 0, wetness: 0, shoreline: 0, macroR: 1, macroG: 1, macroB: 1 },
  });
  const road = evaluator.evaluate({
    tileId: 4, tileR: 0.1, tileG: 0.2, tileB: 0.05, height: 15, grassCoverage: 0, pathMask: 1,
    bakeSample: { grassWeight: 0, dirtWeight: 1, rockWeight: 0, snowWeight: 0, wetness: 0, shoreline: 0, macroR: 1, macroG: 1, macroB: 1 },
  });
  const forest = evaluator.evaluate({
    tileId: 8, tileR: 0.08, tileG: 0.16, tileB: 0.05, height: 15, grassCoverage: 1, pathMask: 0, canopy: 0.9, litter: 0.4,
    bakeSample: { grassWeight: 1, dirtWeight: 0, rockWeight: 0, snowWeight: 0, wetness: 0, shoreline: 0, macroR: 1, macroG: 1, macroB: 1 },
  });
  const snow = evaluator.evaluate({
    tileId: 10, tileR: 0.3, tileG: 0.3, tileB: 0.3, height: 15, grassCoverage: 0, pathMask: 0,
    bakeSample: { grassWeight: 0, dirtWeight: 0, rockWeight: 0, snowWeight: 1, wetness: 0, shoreline: 0, macroR: 1, macroG: 1, macroB: 1 },
  });
  const wetGrass = evaluator.evaluate({
    tileId: 4, tileR: 0.1, tileG: 0.2, tileB: 0.05, height: 15, grassCoverage: 1, pathMask: 0,
    bakeSample: { grassWeight: 1, dirtWeight: 0, rockWeight: 0, snowWeight: 0, wetness: 1, shoreline: 0, macroR: 1, macroG: 1, macroB: 1 },
  });

  // Grass turf must read greener than a dirt road on the same tile ID!
  assert.ok(grass.g > grass.r, `expected green-dominant grass (${grass.r}, ${grass.g}, ${grass.b})`);
  assert.ok(road.r > road.g, `expected brown-dominant road (${road.r}, ${road.g}, ${road.b})`);
  // Forest canopy moss/litter shifts away from sunlit open grass.
  assert.ok(forest.g < grass.g || forest.r !== grass.r);
  // Snow resolves bright high-reflectance white.
  assert.ok(snow.r > 0.65 && snow.g > 0.65 && snow.b > 0.65, `expected bright snow, got ${JSON.stringify(snow)}`);
  // Wetness darkens albedo and lowers roughness.
  assert.ok(wetGrass.g < grass.g);
  assert.ok(wetGrass.roughness < grass.roughness, `expected wet roughness (${wetGrass.roughness}) < dry (${grass.roughness})`);
});

test('PR 2 WSC base texture publishes spatial roads vs grass without baking contact-AO darkening, and refreshes on materialBake arrival', () => {
  clearWorldSurfaceContext();
  const stylized = loadStylizedConfig();
  const chunkSize = 16;
  const tileSize = 2; // 32 m chunk covering x in [0, 32), z in (-32, 0]
  // West half (x < 8): green meadow grass with strong contact=0.9 at x=4; East half (x >= 8): brown dirt road!
  const slot = makeRichSlot({
    chunkX: 0,
    chunkZ: 0,
    chunkSize,
    tileSize,
    tileId: 4,
    cellSetup: (x) => (x < 8
      ? { path: 0, grass: 1, contact: x === 2 ? 0.9 : 0 }
      : { path: 1, grass: 0, contact: 0 }),
  });
  const field = new WorldSurfaceContextField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots: [slot] },
    config: stylized,
  });

  assert.equal(field.update({ x: 16, z: -16 }, { x: 0, z: 0 }), true);
  const onOpenGrass = sampleWorldSurfaceContextCpu(12, -16);
  const onContactGrass = sampleWorldSurfaceContextCpu(5, -16);
  const onRoad = sampleWorldSurfaceContextCpu(24, -16);

  // Spatial separation: open grass is greenish, road is brownish on the EXACT same biome tile!
  assert.ok(onOpenGrass.albedo[1] > onOpenGrass.albedo[0], 'grass side should be green-dominant');
  assert.ok(onRoad.albedo[0] > onRoad.albedo[1], 'road side should be brown-dominant');

  // Orthogonal AO rule: contact=0.9 lives in eco.r (`contact`), NOT baked as darkening into base albedo!
  assert.ok(onContactGrass.contact > 0.7);
  const slotNoContact = makeRichSlot({
    chunkX: 0,
    chunkZ: 0,
    chunkSize,
    tileSize,
    tileId: 4,
    cellSetup: (x) => (x < 8 ? { path: 0, grass: 1, contact: 0 } : { path: 1, grass: 0, contact: 0 }),
  });
  slotNoContact.forestFloorKey = 'ff-no-contact';
  field.terrainView.slots = [slotNoContact];
  assert.equal(field.update({ x: 16, z: -16 }, { x: 0, z: 0 }), true);
  const samePointNoContact = sampleWorldSurfaceContextCpu(5, -16);
  assert.equal(samePointNoContact.contact, 0);
  assert.deepEqual(samePointNoContact.albedo, onContactGrass.albedo,
    'contact AO must not darken WSC base albedo at the same canonical coordinate');
  // Restore slot for snow bake arrival check.
  field.terrainView.slots = [slot];
  assert.equal(field.update({ x: 16, z: -16 }, { x: 0, z: 0 }), true);

  // When materialBake arrives asynchronously (e.g., snow cover), slot signature invalidates & refreshes WSC!
  const sigBeforeBake = field.lastSlotSignature;
  slot.materialBake = makeBake({ res: 16, weights: [0, 0, 0, 255], key: 'bake-snow-v2' });
  assert.equal(field.update({ x: 16, z: -16 }, { x: 0, z: 0 }), true);
  assert.notEqual(field.lastSlotSignature, sigBeforeBake);
  const afterSnowBake = sampleWorldSurfaceContextCpu(12, -16);
  assert.ok(afterSnowBake.albedo[0] > 0.6 && afterSnowBake.albedo[2] > 0.6,
    `expected snow bake albedo, got ${JSON.stringify(afterSnowBake.albedo)}`);
  assert.ok(TERRAIN_SURFACE_CONSTANTS.SNOW_ALBEDO_PURITY > 0.8);
  field.dispose();
});

test('PR 2 negative canonical coordinates, terrainShape weathering, worldNoise, and full 128x128 CPU rebuild performance', () => {
  clearWorldSurfaceContext();
  const stylized = loadStylizedConfig();
  const evaluator = createTerrainSurfaceEvaluator(stylized);
  const sampleA = evaluator.evaluate({
    tileId: 4, tileR: 0.12, tileG: 0.21, tileB: 0.06,
    worldX: -1869, worldZ: -4003, height: 22, grassCoverage: 1, pathMask: 0,
    bakeSample: {
      grassWeight: 1, dirtWeight: 0, rockWeight: 0, snowWeight: 0,
      wetness: 0, shoreline: 0, macroR: 1, macroG: 1, macroB: 1, slope: 0.05, curvature: 0,
    },
  });
  const sampleB = evaluator.evaluate({
    tileId: 4, tileR: 0.12, tileG: 0.21, tileB: 0.06,
    worldX: -1845, worldZ: -3977, height: 22, grassCoverage: 1, pathMask: 0,
    bakeSample: {
      grassWeight: 1, dirtWeight: 0, rockWeight: 0, snowWeight: 0,
      wetness: 0, shoreline: 0, macroR: 1, macroG: 1, macroB: 1, slope: 0.05, curvature: 0,
    },
  });
  for (const s of [sampleA, sampleB]) {
    assert.ok(Number.isFinite(s.r) && s.r >= 0 && s.r <= 1);
    assert.ok(Number.isFinite(s.g) && s.g >= 0 && s.g <= 1);
    assert.ok(Number.isFinite(s.b) && s.b >= 0 && s.b <= 1);
    assert.ok(Number.isFinite(s.roughness) && s.roughness >= 0 && s.roughness <= 1);
  }
  // Spatial patch variation across negative canonical coordinates.
  assert.ok(
    Math.abs(sampleA.r - sampleB.r) + Math.abs(sampleA.g - sampleB.g) + Math.abs(sampleA.b - sampleB.b) > 1e-4,
    'expected non-trivial spatial variation across negative canonical coordinates',
  );

  // Full 128x128 rebuild with full tile/mask/forestFloor/bake slots stays fast (warmed).
  const chunkSize = 64;
  const tileSize = 2; // 128 m chunk covering full WSC window
  const slot = makeRichSlot({
    chunkX: 0,
    chunkZ: 0,
    chunkSize,
    tileSize,
    tileId: 8,
    materialBake: makeBake({ res: 64, weights: [13, 242, 0, 0], key: 'bake-perf-64' }),
  });
  const field = new WorldSurfaceContextField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots: [slot] },
    config: stylized,
  });
  field.update({ x: 64, z: -64 }, { x: 0, z: 0 }); // warmup
  const t0 = performance.now();
  field.rebuild(64, -64, chunkSize, tileSize, chunkSize * tileSize);
  const rebuildMs = performance.now() - t0;
  assert.ok(rebuildMs < 60, `expected 128x128 WSC rebuild < 60 ms in Node, got ${rebuildMs.toFixed(2)} ms`);
  field.dispose();
});
