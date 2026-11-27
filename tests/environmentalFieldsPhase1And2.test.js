import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

import {
  DEFAULT_ENVIRONMENTAL_FIELDS,
  resolveBiomePriorForTile,
  resolveEnvironmentalFieldConfig,
} from '../src/editor/world/EnvironmentalFieldConfig.js';
import {
  buildChunkEnvironmentalField,
  ENV_CHANNELS,
  ENV_CHANNEL_COUNT,
  sampleEnvironmentalPoint,
} from '../src/editor/world/EnvironmentalField.js';
import {
  buildSurfaceMaskPixels,
  createSurfaceMaskConfig,
  enrichPageRenderPixels,
  getSurfaceMaskChunkRadius,
} from '../src/editor/world/ChunkRenderPixels.js';
import { generateBaseWorldChunk } from '../src/editor/world/generateWorldChunk.js';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { createTerrainWorkerBaseTerrain } from '../src/editor/world/TerrainWorkerBaseTerrain.js';
import { AZGAAR_MACRO_SOURCE_KIND } from '../src/editor/import/AzgaarMacroWorldSource.js';
import { encodeMacroField } from '../src/editor/import/MacroAtlasCodec.js';
import { snowAccumulation } from '../src/editor/materials/SnowAccumulation.js';
import {
  bakeTerrainMaterialPage,
  captureTerrainMaterialBakeSource,
} from '../src/editor/materials/TerrainMaterialBakeCpu.js';
import { createTerrainMaterialBakeDescriptor } from '../src/editor/materials/TerrainMaterialBakeDescriptor.js';
import { FULL_TERRAIN_FEATURES, TERRAIN_FEATURES, terrainRegionalFeatures } from '../src/editor/materials/TerrainRegionalFeatures.js';
import { createTerrainMaterial } from '../src/editor/terrainMaterial.js';
import { loadBiomeLooks } from './helpers/biomeLooks.js';
import { createTerrainMaterialBakeConfig } from '../src/editor/materials/TerrainMaterialBakeConfig.js';
import { applyBiomeLooks } from '../src/editor/biomes/applyBiomeLooks.js';

const loadYaml = (path) => yaml.load(readFileSync(new URL(path, import.meta.url), 'utf8'));

function resolvedEnv(search = '') {
  const source = loadYaml('../config/environmental-fields.yaml');
  return resolveEnvironmentalFieldConfig(source, search);
}

test('EnvironmentalFieldConfig validates YAML and supports ?envField=0|1 A/B overrides', () => {
  const enabled = resolvedEnv();
  assert.equal(enabled.enabled, true);
  assert.equal(resolvedEnv('?envField=0').enabled, false);
  assert.equal(resolvedEnv('?envField=1').enabled, true);
  assert.throws(() => resolveEnvironmentalFieldConfig({ ecotone: { minRadiusCells: 20, maxRadiusCells: 10 } }), /maxRadiusCells/);
  assert.throws(() => resolveEnvironmentalFieldConfig({ climate: { solarDirection: [0, 0] } }), /solarDirection/);
  assert.throws(() => resolveEnvironmentalFieldConfig({ biomePriors: { 999: {} } }), /valid terrain tile id/);
  assert.ok(resolveBiomePriorForTile(32, DEFAULT_ENVIRONMENTAL_FIELDS, { arid: { sand: [32] } }).temperature > 0.5);
});

test('TerrainWorkerBaseTerrain preserves minimal 5-field contract and copies optional climate fields when present', () => {
  const base = {
    kind: AZGAAR_MACRO_SOURCE_KIND,
    version: 2,
    source: { mapId: 11 },
    atlas: {
      width: 1,
      height: 1,
      fields: {
        elevation: encodeMacroField(Uint8Array.of(50), 'u8'),
        biomeId: encodeMacroField(Uint8Array.of(4), 'u8'),
        mountainness: encodeMacroField(Uint8Array.of(80), 'u8'),
        ruggedness: encodeMacroField(Uint8Array.of(40), 'u8'),
        valleyness: encodeMacroField(Uint8Array.of(20), 'u8'),
        temperature: encodeMacroField(Int8Array.of(18), 'i8'),
        moisture: encodeMacroField(Uint8Array.of(120), 'u8'),
        agriculturalPotential: encodeMacroField(Uint8Array.of(190), 'u8'),
        featureId: encodeMacroField(Uint16Array.of(3), 'u16'),
      },
    },
    physical: { widthMeters: 1000, heightMeters: 1000 },
    bounds: { minCellX: 0, minCellZ: 0, widthCells: 10, heightCells: 10 },
    oceanTransitionCells: 4,
    terrain: { minHeight: -20, maxHeight: 80, seaLevel: 0 },
    biomes: [],
    rivers: [],
  };
  const compact = createTerrainWorkerBaseTerrain(base);
  assert.ok(compact.atlas.fields.temperature);
  assert.ok(compact.atlas.fields.moisture);
  assert.ok(compact.atlas.fields.agriculturalPotential);
  assert.equal(compact.atlas.fields.featureId, undefined);
});

test('generateBaseWorldChunk preserves soilColorByTile, aridTileIds, and environment in worker maskConfig', () => {
  const editor = loadYaml('../editor.config.yaml');
  const bakeSource = loadYaml('../config/terrain-material-bake.yaml');
  const looks = loadBiomeLooks();
  applyBiomeLooks(editor, bakeSource, looks);
  editor.stylizedSurface.environment = resolvedEnv();
  editor.stylizedSurface.materialBake = createTerrainMaterialBakeConfig(bakeSource);

  const maskConfig = createSurfaceMaskConfig(editor.stylizedSurface, { tileSize: 2 });
  assert.equal(getSurfaceMaskChunkRadius(maskConfig.blendCells, 64, 2, maskConfig.environment), 1);

  const generator = new ProceduralWorldGenerator({ seed: 918273, version: 1, heightScale: 24, seaLevel: -1.5 });
  const page = generateBaseWorldChunk({
    chunkX: 0,
    chunkZ: 0,
    chunkSize: 16,
    worldGenerator: generator,
    surfaceMaskConfig: maskConfig,
  });
  assert.ok(page.envField instanceof Uint8Array);
  assert.equal(page.envField.length, 16 * 16 * ENV_CHANNEL_COUNT);
  assert.ok(page.aridEcotone instanceof Uint8Array);
  assert.equal(page.aridEcotone.length, 16 * 16);
});

test('EnvironmentalField enforces elevation lapse, solar snow asymmetry, hollow moisture, variable ecotone width, and hot-cold thermal buffer', () => {
  const env = resolvedEnv();
  const chunkSize = 64;
  const searchRadius = 29;
  const haloSize = chunkSize + searchRadius * 2;
  const tileSize = 2;

  // 1. Elevation lapse + solar exposure + hollow moisture in grassland (tile 4).
  const grassHalo = new Uint8Array(haloSize * haloSize).fill(4);
  const grassTiles = new Uint8Array(chunkSize * chunkSize).fill(4);
  const vSize = chunkSize + 1;
  const ridgeHeights = new Float32Array(vSize * vSize);
  // Build an east-west ridge peaking at z=32 (south-facing z>32 receives solarDirection [0.35,-0.9367] -> +z in world is -cellZ; let's check both sides!)
  for (let z = 0; z <= chunkSize; z += 1) {
    for (let x = 0; x <= chunkSize; x += 1) {
      const dist = Math.abs(z - 32);
      const ridge = Math.max(0, 260 - dist * 16);
      const hollow = Math.hypot(x - 16, z - 16) < 8 ? -6 : 0;
      ridgeHeights[z * vSize + x] = 20 + ridge + hollow;
    }
  }
  const colorOf = (id) => (id === 1 ? [210, 185, 130] : id === 10 ? [200, 208, 214] : [107, 93, 62]);
  const resTopo = buildChunkEnvironmentalField({
    halo: grassHalo,
    haloSize,
    searchRadius,
    chunkSize,
    originX: 0,
    originZ: 0,
    tileSize,
    worldSeed: 123,
    heights: ridgeHeights,
    sampleHeight: (cx, cz) => {
      const dist = Math.abs(cz - 32);
      const ridge = Math.max(0, 260 - dist * 16);
      const hollow = Math.hypot(cx - 16, cz - 16) < 8 ? -6 : 0;
      return 20 + ridge + hollow;
    },
    tileColor: colorOf,
    environmentConfig: env,
    tiles: grassTiles,
  });

  const tempAt = (lx, lz) => (resTopo.envField[(lz * chunkSize + lx) * ENV_CHANNEL_COUNT + ENV_CHANNELS.TEMP] / 255) * 2 - 1;
  const solarAt = (lx, lz) => resTopo.envField[(lz * chunkSize + lx) * ENV_CHANNEL_COUNT + ENV_CHANNELS.SOLAR] / 255;
  const moistAt = (lx, lz) => resTopo.envField[(lz * chunkSize + lx) * ENV_CHANNEL_COUNT + ENV_CHANNELS.MOISTURE] / 255;

  assert.ok(tempAt(32, 32) < tempAt(32, 8), `ridge peak temp (${tempAt(32, 32).toFixed(3)}) < lowland (${tempAt(32, 8).toFixed(3)})`);
  assert.ok(moistAt(16, 16) > moistAt(48, 8), `concave hollow moisture (${moistAt(16, 16).toFixed(3)}) > flat (${moistAt(48, 8).toFixed(3)})`);

  // Check solar asymmetry on snowAccumulation.
  const classification = {
    snowLine: 700,
    snowFade: 250,
    snowSlopeMax: 0.85,
    snowBiomeCover: { 10: 0.84 },
    snowPatchScale: 60,
    snowPatchStrength: 0.45,
    snowWindShift: 0.25,
    snowConcavity: 4,
  };
  const sunny = solarAt(32, 24);
  const shady = solarAt(32, 40);
  assert.notEqual(Math.round(sunny * 100), Math.round(shady * 100), 'opposite ridge flanks differ in solar exposure');
  const highSolar = Math.max(sunny, shady);
  const lowSolar = Math.min(sunny, shady);
  const snowSunny = snowAccumulation({ height: 810, slope: 0.45, dx: 0, dz: 0, curvature: 0, tileId: 4, solarExposure: highSolar, patch: 0.5 }, classification);
  const snowShady = snowAccumulation({ height: 810, slope: 0.45, dx: 0, dz: 0, curvature: 0, tileId: 4, solarExposure: lowSolar, patch: 0.5 }, classification);
  assert.ok(snowShady > snowSunny + 0.05, `shaded slope snow (${snowShady.toFixed(3)}) > sunlit (${snowSunny.toFixed(3)})`);

  // 2. Hot Desert (1) directly next to Tundra (10): thermal clash buffer prevents sand touching snow, and produces variable width + outlier snow.
  const clashTileAt = (cx) => (cx < 32 ? 1 : 10);
  const clashHalo = new Uint8Array(haloSize * haloSize);
  for (let z = 0; z < haloSize; z += 1) {
    for (let x = 0; x < haloSize; x += 1) {
      clashHalo[z * haloSize + x] = clashTileAt(x - searchRadius);
    }
  }
  const clashTiles = new Uint8Array(chunkSize * chunkSize);
  for (let z = 0; z < chunkSize; z += 1) {
    for (let x = 0; x < chunkSize; x += 1) clashTiles[z * chunkSize + x] = clashTileAt(x);
  }
  const clashTilePixels = new Uint8Array(chunkSize * chunkSize * 4);
  const clashRes = buildChunkEnvironmentalField({
    halo: clashHalo,
    haloSize,
    searchRadius,
    chunkSize,
    originX: 0,
    originZ: 0,
    tileSize,
    worldSeed: 77,
    tileColor: colorOf,
    aridKinds: { sand: [1], mineral: [2] },
    snowCoverByTile: { 10: 0.84, 11: 1 },
    environmentConfig: env,
    tilePixelsOut: clashTilePixels,
    tiles: clashTiles,
  });

  // Verify sand never overlaps with snow cover!
  let mineralBufferCells = 0;
  for (let i = 0; i < chunkSize * chunkSize; i += 1) {
    const code = clashRes.aridEcotone[i];
    const sand = code > 128 ? (code - 128) / 127 : 0;
    const mineral = code < 128 ? (128 - code) / 128 : 0;
    const snow = clashRes.envField[i * ENV_CHANNEL_COUNT + ENV_CHANNELS.SNOW_COVER] / 255;
    assert.ok(!(sand > 0.05 && snow > 0.05), `hot sand (${sand.toFixed(2)}) must not overlap snow (${snow.toFixed(2)}) at cell ${i}`);
    if (mineral > 0.1) mineralBufferCells += 1;
  }
  assert.ok(mineralBufferCells > 20, `expected mineral steppe thermal buffer cells between hot desert and tundra, got ${mineralBufferCells}`);

  // Verify variable ecotone width & warp across rows (crossing x of snow > 0.25 varies across z).
  const snowCrossings = new Set();
  for (let z = 0; z < chunkSize; z += 1) {
    for (let x = 0; x < chunkSize; x += 1) {
      const snow = clashRes.envField[(z * chunkSize + x) * ENV_CHANNEL_COUNT + ENV_CHANNELS.SNOW_COVER] / 255;
      if (snow > 0.25) {
        snowCrossings.add(x);
        break;
      }
    }
  }
  assert.ok(snowCrossings.size >= 3, `expected irregular snow boundary across rows, got ${snowCrossings.size} distinct crossings`);

  // On a cool Grassland (4) <-> Tundra (10) border, patchy snow outliers finger widely across rows.
  const coolTileAt = (cx) => (cx < 32 ? 4 : 10);
  const coolHalo = new Uint8Array(haloSize * haloSize);
  const coolTiles = new Uint8Array(chunkSize * chunkSize);
  for (let z = 0; z < haloSize; z += 1) {
    for (let x = 0; x < haloSize; x += 1) coolHalo[z * haloSize + x] = coolTileAt(x - searchRadius);
  }
  for (let z = 0; z < chunkSize; z += 1) {
    for (let x = 0; x < chunkSize; x += 1) coolTiles[z * chunkSize + x] = coolTileAt(x);
  }
  const coolRes = buildChunkEnvironmentalField({
    halo: coolHalo, haloSize, searchRadius, chunkSize, originX: 0, originZ: 0, tileSize, worldSeed: 77,
    tileColor: colorOf, snowCoverByTile: { 10: 0.84, 11: 1 }, environmentConfig: env, tiles: coolTiles,
  });
  const coolCrossings = new Set();
  for (let z = 0; z < chunkSize; z += 1) {
    for (let x = 0; x < chunkSize; x += 1) {
      const snow = coolRes.envField[(z * chunkSize + x) * ENV_CHANNEL_COUNT + ENV_CHANNELS.SNOW_COVER] / 255;
      if (snow > 0.12) {
        coolCrossings.add(x);
        break;
      }
    }
  }
  assert.ok(coolCrossings.size >= 5, `expected wide patchy snow fingers on cool border, got ${coolCrossings.size} crossings`);

  // Verify sampleEnvironmentalPoint returns bounded fields.
  const pt = sampleEnvironmentalPoint({
    x: 20,
    z: -20,
    tileSize,
    worldSeed: 77,
    tileAt: (cx) => clashTileAt(cx),
    heightAt: () => 25,
    environmentConfig: env,
  });
  assert.ok(pt.temperature >= -1 && pt.temperature <= 1 && pt.moisture >= 0 && pt.moisture <= 1);
});

test('neighboring chunks with envField and aridEcotone bake identical edge texels across shared boundaries', async () => {
  const env = resolvedEnv();
  const chunkSize = 8;
  const tileAt = (cx) => (cx < 8 ? 1 : 4);
  const heightAt = (vx, vz) => (vx * vx) * 0.04 + vz * 0.1;

  const makePage = (chunkX) => {
    const originX = chunkX * chunkSize;
    const tiles = new Uint8Array(chunkSize * chunkSize);
    for (let z = 0; z < chunkSize; z += 1) {
      for (let x = 0; x < chunkSize; x += 1) tiles[z * chunkSize + x] = tileAt(originX + x);
    }
    const heights = new Float32Array((chunkSize + 1) ** 2);
    for (let z = 0; z <= chunkSize; z += 1) {
      for (let x = 0; x <= chunkSize; x += 1) heights[z * (chunkSize + 1) + x] = heightAt(originX + x, z);
    }
    const page = { originX, originZ: 0, tiles, heights };
    const maskConfig = {
      ...createSurfaceMaskConfig({
        grass: { tileIds: [4], meadow: {} },
        biomeLooks: { soil: { 1: '#d2b982', 4: '#6b5d3e' }, arid: { sand: [1], mineral: [2] }, snow: { ground: [] }, glacier: [] },
        environment: env,
      }, { tileSize: 2 }),
      worldSeed: 55,
    };
    return enrichPageRenderPixels(page, tileAt, maskConfig, (id) => ({
      id,
      color: id === 1 ? '#d2b982' : '#6b5d3e',
    }), { sampleHeight: heightAt });
  };

  const pages = new Map([[0, makePage(0)], [1, makePage(1)]]);
  const bakeConfig = {
    qualityTiers: { balanced: { resolution: 8 } },
    build: { rowsPerYield: 4 },
    classification: {
      rockSlopeStart: 0.18, rockSlopeFull: 0.62, snowLine: 700, snowFade: 250,
      snowSlopeMax: 0.85, snowPatchScale: 60, snowPatchStrength: 0.45, snowWindShift: 0.25,
      snowConcavity: 4, shorelineRadiusCells: 4, wetnessRadiusCells: 2,
    },
    macro: { scaleMeters: 120, strength: 0.1, seedOffset: 2401, heightShadeScale: 0.018, minHeightShade: 0.72, maxHeightShade: 1.22, wetDarkening: 0.18 },
  };
  const bake = async (chunkX) => {
    const source = captureTerrainMaterialBakeSource({
      page: pages.get(chunkX),
      chunkSize,
      pageAt: (cx, cz) => (cz === 0 ? pages.get(cx) ?? null : null),
    });
    const descriptor = createTerrainMaterialBakeDescriptor({
      chunkX, chunkZ: 0, quality: 'balanced', revisions: { world: 0, tile: 0, height: 0, water: 0, canopy: 0 },
    });
    return (await bakeTerrainMaterialPage({
      source, descriptor, config: bakeConfig, chunkSize, tileSize: 2, worldSeed: 55, yieldControl: async () => {},
    })).value;
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
        assert.equal(a, b, `${name}[${c}] row ${z}: west ${a} vs east ${b}`);
      }
    }
  }
});

test('TerrainRegionalFeatures admits arid ecotone chunks and terrainMaterial assembles cleanly with environment enabled', () => {
  const editor = loadYaml('../editor.config.yaml');
  const bakeSource = loadYaml('../config/terrain-material-bake.yaml');
  const looks = loadBiomeLooks();
  applyBiomeLooks(editor, bakeSource, looks);
  editor.stylizedSurface.environment = resolvedEnv();
  editor.stylizedSurface.materialBake = createTerrainMaterialBakeConfig(bakeSource);

  // A grassland chunk with `hasAridEcotone: true` must include TERRAIN_FEATURES.ARID.
  const features = terrainRegionalFeatures({
    tiles: new Uint8Array(16).fill(4),
    surfaceMaskPixels: new Uint8Array(16 * 4).fill(255),
    hasAridEcotone: true,
  }, editor.stylizedSurface, false);
  assert.ok((features & TERRAIN_FEATURES.ARID) !== 0, 'arid ecotone edge enables ARID feature bit');

  const dummyTex = () => new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const material = createTerrainMaterial({
    tileTexture: dummyTex(),
    heightTexture: dummyTex(),
    surfaceMaskTexture: dummyTex(),
    forestFloorTexture: dummyTex(),
    chunkCenter: uniform(new THREE.Vector2(0, 0)),
    chunkWorldSize: 64,
    width: 32,
    stylizedConfig: editor.stylizedSurface,
    regionalFeatures: FULL_TERRAIN_FEATURES,
  });
  assert.ok(material.colorNode && material.positionNode);
  material.dispose();
});
