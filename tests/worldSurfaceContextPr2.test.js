import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, vec2 } from 'three/tsl';
import {
  TERRAIN_SURFACE_CONSTANTS,
  WorldSurfaceContextField,
  bilinearTexelCoords,
  clearWorldSurfaceContext,
  createTerrainSurfaceEvaluator,
  sampleMaterialBakeChannels,
  sampleRgba8Bilinear,
  sampleWorldSurfaceContextCpu,
} from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContextField.js';
import { createTerrainMaterialBakeConfig } from '../src/editor/materials/TerrainMaterialBakeConfig.js';
import { createTerrainWeatheringState } from '../src/editor/materials/TerrainMaterialWeatheringNodes.js';
import { terrainSubstrateResponse } from '../src/editor/materials/TerrainSubstrateMath.js';
import { evaluateShaderNode } from '../test/helpers/evaluateShaderNode.js';

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
      ? { path: 0, grass: 1, contact: (x === 2 || x === 3) ? 0.9 : 0 }
      : { path: 1, grass: 0, contact: 0 }),
  });
  const field = new WorldSurfaceContextField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots: [slot] },
    config: stylized,
  });

  assert.equal(field.update({ x: 16, z: -16 }, { x: 0, z: 0 }), true);
  const onOpenGrass = sampleWorldSurfaceContextCpu(12, -16);
  const onContactGrass = sampleWorldSurfaceContextCpu(6, -16);
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
  const samePointNoContact = sampleWorldSurfaceContextCpu(6, -16);
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
  try {
    field.update({ x: 64, z: -64 }, { x: 0, z: 0 }); // warmup
    const samples = [];
    for (let sample = 0; sample < 3; sample += 1) {
      const t0 = performance.now();
      field.rebuild(64, -64, chunkSize, tileSize, chunkSize * tileSize);
      samples.push(performance.now() - t0);
    }
    // A single scheduler stall in the parallel suite should not fail the budget.
    const rebuildMs = samples.sort((a, b) => a - b)[1];
    assert.ok(rebuildMs < 60, `expected median 128x128 WSC rebuild < 60 ms in Node, got ${rebuildMs.toFixed(2)} ms`);
  } finally {
    field.dispose();
  }
});

test('PR 2 CPU material-bake and RGBA8 bilinear sampling match GPU bilinearTexels at centres, half-texels, quarters, edges, and negative coords', () => {
  const res = 4;
  const n = res * res;
  const materialWeights = new Uint8Array(n * 4);
  const wetnessShoreline = new Uint8Array(n * 2);
  const macroTint = new Uint8Array(n * 4);
  const terrainShape = new Uint16Array(n * 2);
  const rgba8 = new Uint8Array(n * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const fromHalf = THREE.DataUtils.fromHalfFloat;

  for (let z = 0; z < res; z += 1) {
    for (let x = 0; x < res; x += 1) {
      const idx = z * res + x;
      // Intentionally varied weights (including non-255 sums to exercise post-filter renormalization).
      materialWeights[idx * 4] = 40 + x * 45;
      materialWeights[idx * 4 + 1] = 30 + z * 40;
      materialWeights[idx * 4 + 2] = 15 + ((x + z) % 3) * 35;
      materialWeights[idx * 4 + 3] = 10 + (x * z) * 12;
      wetnessShoreline[idx * 2] = 20 + x * 55;
      wetnessShoreline[idx * 2 + 1] = 15 + z * 60;
      macroTint[idx * 4] = 96 + x * 16;
      macroTint[idx * 4 + 1] = 112 + z * 12;
      macroTint[idx * 4 + 2] = 120 + (x - z) * 8;
      macroTint[idx * 4 + 3] = 255;
      terrainShape[idx * 2] = toHalf(0.05 + x * 0.14 + z * 0.07);
      terrainShape[idx * 2 + 1] = toHalf(-0.08 + x * 0.03 + z * 0.04);
      rgba8[idx * 4] = 30 + x * 50;
      rgba8[idx * 4 + 1] = 20 + z * 55;
      rgba8[idx * 4 + 2] = 40 + (x + z) * 25;
      rgba8[idx * 4 + 3] = 255;
    }
  }
  const bake = {
    descriptor: { key: 'bilinear-parity-4x4' },
    resolution: res,
    channels: { materialWeights, wetnessShoreline, macroTint, terrainShape },
  };

  // Independent reference of GPU `bilinearTexels` (`TerrainSlotBindings.js:65-73`).
  // `edge`: the bake's edge-aligned texels, read through TerrainMaterialBakedNodes' uv remap.
  const gpuBilinearRef = (u, v, readTexel, edge = false) => {
    const cu = Math.max(0, Math.min(1, u));
    const cv = Math.max(0, Math.min(1, v));
    const tx = edge ? cu * (res - 1) : cu * res - 0.5;
    const tz = edge ? cv * (res - 1) : cv * res - 0.5;
    const bx = Math.floor(tx);
    const bz = Math.floor(tz);
    const wx = tx - bx;
    const wz = tz - bz;
    const cl = (k) => Math.max(0, Math.min(res - 1, k));
    const a = readTexel(cl(bx), cl(bz));
    const b = readTexel(cl(bx + 1), cl(bz));
    const c = readTexel(cl(bx), cl(bz + 1));
    const d = readTexel(cl(bx + 1), cl(bz + 1));
    return (a * (1 - wx) + b * wx) * (1 - wz) + (c * (1 - wx) + d * wx) * wz;
  };

  // Texel centres, exact half-texel boundaries, quarter positions, and chunk edges (0, 1).
  const uvPoints = [
    [0, 0], [1, 1], [0, 0.5], [1, 0.5],
    [0.125, 0.125], [0.625, 0.375],
    [0.25, 0.5], [0.5, 0.75],
    [0.1875, 0.4375], [0.8125, 0.0625],
  ];
  const out = {};
  const rgbaOut = [0, 0, 0, 0];
  const coordOut = {};
  for (const [u, v] of uvPoints) {
    bilinearTexelCoords(u, v, res, coordOut);
    assert.ok(Math.abs((coordOut.w00 + coordOut.w10 + coordOut.w01 + coordOut.w11) - 1) < 1e-12);

    assert.equal(sampleMaterialBakeChannels(bake, u, v, out), true);
    const rawG = gpuBilinearRef(u, v, (x, z) => materialWeights[(z * res + x) * 4] / 255, true);
    const rawD = gpuBilinearRef(u, v, (x, z) => materialWeights[(z * res + x) * 4 + 1] / 255, true);
    const rawR = gpuBilinearRef(u, v, (x, z) => materialWeights[(z * res + x) * 4 + 2] / 255, true);
    const rawS = gpuBilinearRef(u, v, (x, z) => materialWeights[(z * res + x) * 4 + 3] / 255, true);
    const rawSum = rawG + rawD + rawR + rawS;
    assert.ok(Math.abs(out.grassWeight - rawG / rawSum) < 1e-6);
    assert.ok(Math.abs(out.dirtWeight - rawD / rawSum) < 1e-6);
    assert.ok(Math.abs(out.rockWeight - rawR / rawSum) < 1e-6);
    assert.ok(Math.abs(out.snowWeight - rawS / rawSum) < 1e-6);
    assert.ok(Math.abs((out.grassWeight + out.dirtWeight + out.rockWeight + out.snowWeight) - 1) < 1e-6);

    const refWet = gpuBilinearRef(u, v, (x, z) => wetnessShoreline[(z * res + x) * 2] / 255, true);
    const refShore = gpuBilinearRef(u, v, (x, z) => wetnessShoreline[(z * res + x) * 2 + 1] / 255, true);
    assert.ok(Math.abs(out.wetness - refWet) < 1e-6);
    assert.ok(Math.abs(out.shoreline - refShore) < 1e-6);

    const refMacroR = Math.max(0.65, Math.min(1.35, gpuBilinearRef(u, v, (x, z) => macroTint[(z * res + x) * 4] / 255, true) * 2));
    assert.ok(Math.abs(out.macroR - refMacroR) < 1e-6);

    const refSlope = gpuBilinearRef(u, v, (x, z) => fromHalf(terrainShape[(z * res + x) * 2]), true);
    const refCurv = gpuBilinearRef(u, v, (x, z) => fromHalf(terrainShape[(z * res + x) * 2 + 1]), true);
    assert.ok(Math.abs(out.slope - refSlope) < 1e-6);
    assert.ok(Math.abs(out.curvature - refCurv) < 1e-6);

    sampleRgba8Bilinear(rgba8, res, u, v, rgbaOut);
    for (let ch = 0; ch < 3; ch += 1) {
      const refCh = gpuBilinearRef(u, v, (x, z) => rgba8[(z * res + x) * 4 + ch] / 255);
      assert.ok(Math.abs(rgbaOut[ch] - refCh) < 1e-6);
    }
  }

  // Verify bilinear smoothing inside WorldSurfaceContextField at negative canonical coordinates.
  clearWorldSurfaceContext();
  const chunkSize = 16;
  const tileSize = 2; // 32 m chunk
  const negChunkX = -50;
  const negChunkZ = 30;
  const stepBake = makeBake({ res: 2, key: 'step-neg' });
  // West texel (x=0): full grass; East texel (x=1): full snow.
  for (let z = 0; z < 2; z += 1) {
    stepBake.channels.materialWeights[(z * 2 + 0) * 4] = 255;
    stepBake.channels.materialWeights[(z * 2 + 0) * 4 + 3] = 0;
    stepBake.channels.materialWeights[(z * 2 + 1) * 4] = 0;
    stepBake.channels.materialWeights[(z * 2 + 1) * 4 + 3] = 255;
  }
  const negSlot = makeRichSlot({
    chunkX: negChunkX,
    chunkZ: negChunkZ,
    chunkSize,
    tileSize,
    tileId: 4,
    materialBake: stepBake,
  });
  const field = new WorldSurfaceContextField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots: [negSlot] },
    config: loadStylizedConfig(),
  });
  try {
    const cx = negChunkX * 32 + 16;
    const cz = -(negChunkZ * 32 + 16);
    assert.equal(field.update({ x: cx, z: cz }, { x: 0, z: 0 }), true);
    const west = sampleWorldSurfaceContextCpu(cx - 10, cz);
    const mid = sampleWorldSurfaceContextCpu(cx, cz);
    const east = sampleWorldSurfaceContextCpu(cx + 10, cz);
    // Midpoint straddles the bilinear ramp between green grass (west) and bright snow (east).
    assert.ok(mid.albedo[0] > west.albedo[0] + 0.08 && mid.albedo[0] < east.albedo[0] - 0.08,
      `expected smooth bilinear transition at negative canonical seam: west=${west.albedo[0].toFixed(3)} mid=${mid.albedo[0].toFixed(3)} east=${east.albedo[0].toFixed(3)}`);
  } finally {
    field.dispose();
  }
});

test('PR 2 CPU TerrainSurfaceEvaluator matches GPU TSL weathering and substrate math', () => {
  const stylized = loadStylizedConfig();
  const weatheringCfg = stylized.materialBake.families.weathering;
  const substratesCfg = stylized.materialBake.families.substrates;

  // 1. Compare weathering multiplier & roughness offset directly against TSL `createTerrainWeatheringState`.
  const weatheringCases = [
    { slope: 0.1, curvature: 0.0, wetness: 0.0, canopy: 0.0, shoreline: 0.0 },
    { slope: 0.55, curvature: 0.06, wetness: 0.75, canopy: 0.8, shoreline: 0.2 },
    { slope: 0.3, curvature: -0.04, wetness: 0.25, canopy: 0.1, shoreline: 0.9 },
  ];
  for (const tc of weatheringCases) {
    const tslState = createTerrainWeatheringState({
      terrainShape: vec2(tc.slope, tc.curvature),
      wetness: float(tc.wetness),
      canopy: float(tc.canopy),
      shoreline: float(tc.shoreline),
      cameraDistance: float(10), // 100% visibility inside WSC window
      weathering: weatheringCfg,
    });
    const rawMul = evaluateShaderNode(tslState.colorMultiplier);
    const gpuMul = Array.isArray(rawMul) ? rawMul[0] : rawMul;
    const gpuRough = evaluateShaderNode(tslState.roughnessOffset);

    // Isolate weathering effect in TerrainSurfaceEvaluator by disabling genomes/worldNoise/substrates.
    const isolatedCfg = {
      ...stylized,
      materialBake: {
        ...stylized.materialBake,
        families: {
          ...stylized.materialBake.families,
          genomes: { ...stylized.materialBake.families.genomes, enabled: false },
          worldNoise: { ...stylized.materialBake.families.worldNoise, enabled: false },
          substrates: null,
        },
      },
    };
    const evalWithWeather = createTerrainSurfaceEvaluator(isolatedCfg);
    const evalNoWeather = createTerrainSurfaceEvaluator({
      ...isolatedCfg,
      materialBake: {
        ...isolatedCfg.materialBake,
        families: {
          ...isolatedCfg.materialBake.families,
          weathering: { ...weatheringCfg, enabled: false },
        },
      },
    });
    const input = {
      tileId: 4, tileR: 0.15, tileG: 0.22, tileB: 0.1, height: 10, grassCoverage: 1, pathMask: 0,
      canopy: tc.canopy, litter: 0,
      bakeSample: {
        grassWeight: 1, dirtWeight: 0, rockWeight: 0, snowWeight: 0,
        wetness: tc.wetness, shoreline: tc.shoreline, macroR: 1, macroG: 1, macroB: 1,
        slope: tc.slope, curvature: tc.curvature,
      },
    };
    const withW = evalWithWeather.evaluate(input);
    const noW = evalNoWeather.evaluate(input);
    assert.ok(
      Math.abs((withW.roughness - noW.roughness) - gpuRough) < 1e-5,
      `weathering roughness mismatch: cpu=${(withW.roughness - noW.roughness).toFixed(6)} gpu=${gpuRough.toFixed(6)}`,
    );
    // When un-clamped and without shoreline/canopy override, near/mid albedo scales directly by gpuMul.
    if (tc.shoreline === 0 && tc.canopy === 0) {
      const cpuRatio = withW.g / noW.g;
      assert.ok(
        Math.abs(cpuRatio - gpuMul) < 1e-4,
        `weathering color multiplier mismatch: cpu=${cpuRatio.toFixed(6)} gpu=${gpuMul.toFixed(6)}`,
      );
    }
  }

  // 2. Compare zero-alloc substrate response against canonical `terrainSubstrateResponse`.
  const subOnlyCfg = {
    ...stylized,
    materialBake: {
      ...stylized.materialBake,
      families: {
        ...stylized.materialBake.families,
        genomes: { ...stylized.materialBake.families.genomes, enabled: false },
        weathering: { ...weatheringCfg, enabled: false },
        worldNoise: { ...stylized.materialBake.families.worldNoise, enabled: false },
      },
    },
  };
  const evalSub = createTerrainSurfaceEvaluator(subOnlyCfg);
  for (const [tileId, canopy, wetness, shoreline] of [[1, 0, 0.2, 0.1], [8, 0.85, 0.1, 0], [10, 0, 0.4, 0.3]]) {
    const ref = terrainSubstrateResponse({ tileId, canopy, wetness, shoreline }, substratesCfg);
    const res = evalSub.evaluate({
      tileId, tileR: 0.12, tileG: 0.12, tileB: 0.12, height: 10, grassCoverage: 0, pathMask: 0,
      canopy, litter: 0,
      bakeSample: {
        grassWeight: 0, dirtWeight: 1, rockWeight: 0, snowWeight: 0,
        wetness, shoreline, macroR: 1, macroG: 1, macroB: 1, slope: 0, curvature: 0,
      },
    });
    assert.ok(
      Math.abs(res.roughness - ref.roughness) < 1e-5,
      `substrate roughness mismatch for tile ${tileId}: cpu=${res.roughness} ref=${ref.roughness}`,
    );
  }
});
