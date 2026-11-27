import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

import { landformRelief } from '../src/editor/world/TerrainLandforms.js';
import {
  climateSurfaceRelief,
  proceduralMountainRelief,
} from '../src/editor/world/MultiscaleTerrainRelief.js';
import {
  DEFAULT_MOUNTAIN_RIDGES,
  erosionGullyHeight,
  foothillHeight,
  resolveMountainRidges,
  ridgeHeight,
  validateMountainRidges,
} from '../src/editor/world/MountainRidges.js';
import { alpineHeight, alpineLakeLift } from '../src/editor/world/AlpineRelief.js';
import { AzgaarMacroWorldGenerator } from '../src/editor/world/AzgaarMacroWorldGenerator.js';
import { createMacroAtlasPayload } from '../src/editor/import/AzgaarMacroWorldSource.js';
import { createAzgaarBiomeDefinitions } from '../src/editor/AzgaarBiomeCatalog.js';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { ENV_CHANNEL_COUNT, ENV_CHANNELS } from '../src/editor/world/EnvironmentalField.js';
import {
  bakeTerrainMaterialPage,
  captureTerrainMaterialBakeSource,
} from '../src/editor/materials/TerrainMaterialBakeCpu.js';
import { createTerrainMaterialBakeDescriptor } from '../src/editor/materials/TerrainMaterialBakeDescriptor.js';
import { FULL_TERRAIN_FEATURES } from '../src/editor/materials/TerrainRegionalFeatures.js';
import { createTerrainMaterial } from '../src/editor/terrainMaterial.js';
import { loadBiomeLooks } from './helpers/biomeLooks.js';
import { createTerrainMaterialBakeConfig } from '../src/editor/materials/TerrainMaterialBakeConfig.js';
import { applyBiomeLooks } from '../src/editor/biomes/applyBiomeLooks.js';
import { resolveEnvironmentalFieldConfig } from '../src/editor/world/EnvironmentalFieldConfig.js';
import { alpineRocksInCell } from '../src/editor/stylized/alpine/alpineRockField.js';
import { AlpineRockView } from '../src/editor/stylized/alpine/AlpineRockView.js';

const loadYaml = (path) => yaml.load(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('landformRelief preserves bounded displacement and gentle 1-cell slope across scales', () => {
  let maxDelta = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let z = -600; z <= 600; z += 17) {
    for (let x = -600; x <= 600; x += 17) {
      const h = landformRelief(x, z, 42);
      const hx = landformRelief(x + 1, z, 42);
      const hz = landformRelief(x, z + 1, 42);
      minVal = Math.min(minVal, h);
      maxVal = Math.max(maxVal, h);
      maxDelta = Math.max(maxDelta, Math.abs(hx - h), Math.abs(hz - h));
    }
  }
  assert.ok(minVal > -16 && maxVal < 16, `expected (-16, +16), got [${minVal}, ${maxVal}]`);
  assert.ok(maxDelta < 1.2, `expected 1-cell delta < 1.2 (slope < 0.6), got ${maxDelta}`);
});

test('climateSurfaceRelief drives 3D dunes and snowbanks while staying zero in neutral climates', () => {
  assert.equal(climateSurfaceRelief(120, -45, 7, { sand: 0, snow: 0 }), 0);

  let duneMin = Infinity;
  let duneMax = -Infinity;
  let snowMin = Infinity;
  let snowMax = -Infinity;
  for (let i = 0; i < 64; i += 1) {
    const x = i * 4.2;
    const z = i * 2.7;
    const d = climateSurfaceRelief(x, z, 11, { sand: 1, snow: 0 });
    const s = climateSurfaceRelief(x, z, 11, { sand: 0, snow: 1 });
    duneMin = Math.min(duneMin, d);
    duneMax = Math.max(duneMax, d);
    snowMin = Math.min(snowMin, s);
    snowMax = Math.max(snowMax, s);
  }
  assert.ok(duneMax - duneMin > 1.5, `expected visible dune relief, got span ${duneMax - duneMin}`);
  assert.ok(snowMax - snowMin > 1.0, `expected visible snowbank relief, got span ${snowMax - snowMin}`);
});

test('proceduralMountainRelief respects sea level and elevates interior ranges in ProceduralWorldGenerator', () => {
  assert.equal(proceduralMountainRelief(500, 500, 99, 2, 0), 0);
  const gen = new ProceduralWorldGenerator({ seed: 73 });
  assert.ok(Number.isFinite(gen.sampleBaseHeight(0, 0)));
  let maxRelief = 0;
  for (let x = -2000; x <= 2000; x += 250) {
    maxRelief = Math.max(maxRelief, proceduralMountainRelief(x, 600, 73, 45, gen.seaLevel));
  }
  assert.ok(maxRelief > 20, `expected regional mountain uplift inland, got ${maxRelief}`);
});

test('MountainRidges extends progressive foothills and erosion gullies without breaking defaults', () => {
  assert.equal(DEFAULT_MOUNTAIN_RIDGES.foothillMeters, 0);
  assert.equal(DEFAULT_MOUNTAIN_RIDGES.gullyMeters, 0);
  assert.equal(ridgeHeight(500, 500, 1, 0.2, DEFAULT_MOUNTAIN_RIDGES), 0);

  const ridges = resolveMountainRidges({
    heightMeters: 280,
    startRelief: 0.3,
    fullRelief: 0.65,
    couloirMeters: 45,
    notchMeters: 40,
    foothillMeters: 52,
    gullyMeters: 22,
  });
  assert.throws(() => validateMountainRidges({ ...ridges, foothillMeters: -1 }, 'test'), /foothillMeters/);

  // Foothills emerge smoothly below startRelief: at 0.14 (before gully belt) ridgeHeight matches foothillHeight.
  const pureFoot = foothillHeight(240, 180, 13, 0.14, ridges, 1);
  assert.notEqual(pureFoot, 0);
  assert.equal(ridgeHeight(240, 180, 13, 0.14, ridges, 1), pureFoot);
  assert.equal(
    ridgeHeight(240, 180, 13, 0.24, ridges, 1),
    foothillHeight(240, 180, 13, 0.24, ridges, 1) + erosionGullyHeight(240, 180, 13, 0.24, ridges, 1),
  );

  // Erosion gullies vary across the mountain flank.
  let minGully = Infinity;
  let maxGully = -Infinity;
  for (let x = 0; x < 400; x += 25) {
    const g = erosionGullyHeight(x, 150, 13, 0.55, ridges, 1);
    minGully = Math.min(minGully, g);
    maxGully = Math.max(maxGully, g);
  }
  assert.ok(minGully < 0 && maxGully > 0, `expected bidirectional gully modulation, got [${minGully}, ${maxGully}]`);

  // Alpine lakes remain level on calmed ground (calm = 1) even with foothills/talus enabled.
  const weight = 0.72;
  assert.equal(alpineHeight(420, -310, 19, weight, 1, true), alpineLakeLift(weight));
});

test('AzgaarMacroWorldGenerator applies desert dune relief near desert areas and preserves far/near ridge parity', () => {
  const width = 4;
  const height = 4;
  const elevations = new Uint8Array(width * height).fill(50);
  const desertBiomes = new Uint8Array(width * height).fill(1); // Hot desert
  const features = new Uint16Array(width * height).fill(1);
  const desertSource = {
    kind: 'azgaar-macro-v1',
    version: 1,
    source: { mapId: 'phase3-4-test', seed: 'dune' },
    bounds: { minCellX: -64, minCellZ: -64, widthCells: 128, heightCells: 128 },
    physical: { widthMeters: 256, heightMeters: 256, distanceScale: 1, distanceUnit: 'km' },
    atlas: {
      width,
      height,
      ...createMacroAtlasPayload({ heights: elevations, biomes: desertBiomes, features }),
    },
    oceanTransitionCells: 8,
    terrain: {
      minHeight: -40,
      maxHeight: 900,
      seaLevel: 0,
      verticalExaggeration: 1,
      ridges: {
        heightMeters: 280,
        startRelief: 0.3,
        fullRelief: 0.65,
        couloirMeters: 45,
        notchMeters: 40,
        foothillMeters: 52,
        gullyMeters: 22,
        fineMeters: 0,
      },
    },
    biomes: createAzgaarBiomeDefinitions(),
    rivers: [],
    lakes: [],
    routes: [],
    settlements: [],
  };
  const desertGen = new AzgaarMacroWorldGenerator(desertSource, { seed: 27, version: 1, heightScale: 12, seaLevel: 0 });
  assert.ok(desertGen.sandMask !== null);
  let nearMin = Infinity;
  let nearMax = -Infinity;
  for (let x = -20; x <= 20; x += 2) {
    const h = desertGen.sampleTerrainHeight(x, 0);
    nearMin = Math.min(nearMin, h);
    nearMax = Math.max(nearMax, h);
  }
  assert.ok(nearMax - nearMin > 2, 'desert dunes + landforms create multi-metre local variation');

  // Near-vs-far ridge parity (including foothills and erosion gullies) when coastFade === 1.
  const highlandBiomes = new Uint8Array(width * height).fill(4);
  const ridgeSource = {
    ...desertSource,
    atlas: {
      width,
      height,
      ...createMacroAtlasPayload({ heights: elevations, biomes: highlandBiomes, features }),
    },
  };
  const noRidgeSource = {
    ...ridgeSource,
    terrain: { ...ridgeSource.terrain, ridges: null },
  };
  const withRidges = new AzgaarMacroWorldGenerator(ridgeSource, { seed: 27, version: 1, heightScale: 12, seaLevel: 0 });
  const withoutRidges = new AzgaarMacroWorldGenerator(noRidgeSource, { seed: 27, version: 1, heightScale: 12, seaLevel: 0 });
  assert.equal(withRidges.sandMask, null);
  for (const [px, pz] of [[0, 0], [18, -14], [-22, 16]]) {
    const nearDelta = withRidges.sampleTerrainHeight(px, pz) - withoutRidges.sampleTerrainHeight(px, pz);
    const farDelta = withRidges.sampleMacroColumn(px, pz).height - withoutRidges.sampleMacroColumn(px, pz).height;
    assert.ok(
      Math.abs(nearDelta - farDelta) < 1e-9,
      `expected near/far ridge delta parity at (${px},${pz}), got ${nearDelta} vs ${farDelta}`,
    );
  }
});

test('TerrainMaterialBakeCpu exposes talusRock in concave mountain toes when envField is present', async () => {
  const chunkSize = 8;
  const pad = 2;
  const paddedSize = chunkSize + pad * 2 + 1;
  const count = paddedSize * paddedSize;
  const surfaceMaskPixels = new Uint8Array(count * 4);
  const envField = new Uint8Array(count * ENV_CHANNEL_COUNT);
  const heightValues = new Float32Array(count);

  // Build two symmetric regions: concave bowl (negative curvature) vs flat ramp with identical moderate slope.
  for (let z = 0; z < paddedSize; z += 1) {
    for (let x = 0; x < paddedSize; x += 1) {
      const idx = z * paddedSize + x;
      const off = idx * 4;
      surfaceMaskPixels[off] = 0;
      surfaceMaskPixels[off + 1] = 255;
      surfaceMaskPixels[off + 2] = 0;
      surfaceMaskPixels[off + 3] = 255;
      const dx = (x - pad) - 4;
      heightValues[idx] = dx * 0.72 + Math.max(0, dx) * 0.45;
      const eOff = idx * ENV_CHANNEL_COUNT;
      envField[eOff + ENV_CHANNELS.SOLAR] = 128;
      envField[eOff + ENV_CHANNELS.TEMP] = 128;
      envField[eOff + ENV_CHANNELS.MOISTURE] = 128;
      envField[eOff + ENV_CHANNELS.GEOLOGY] = 128;
    }
  }
  const makePage = () => ({
    revision: 0,
    terrainRevision: 0,
    canopyRevision: 0,
    chunkX: 0,
    chunkZ: 0,
    resolution: paddedSize,
    heights: heightValues,
    tiles: new Uint8Array(count).fill(4),
    tilePixels: new Uint8Array(count * 4).fill(128),
    surfaceMaskPixels,
    envField,
  });
  const bakeConfig = {
    qualityTiers: { balanced: { resolution: 8 } },
    build: { rowsPerYield: 8 },
    classification: {
      rockSlopeStart: 0.4, rockSlopeFull: 0.9, snowLine: 700, snowFade: 250,
      snowSlopeMax: 0.85, snowPatchScale: 60, snowPatchStrength: 0.45, snowWindShift: 0.25,
      snowConcavity: 4, shorelineRadiusCells: 4, wetnessRadiusCells: 2,
    },
    macro: { scaleMeters: 120, strength: 0.1, seedOffset: 2401, heightShadeScale: 0.018, minHeightShade: 0.72, maxHeightShade: 1.22, wetDarkening: 0.18 },
  };
  const page = makePage();
  const source = captureTerrainMaterialBakeSource({
    page,
    chunkSize,
    pageAt: (cx, cz) => (cx === 0 && cz === 0 ? page : null),
  });
  const descriptor = createTerrainMaterialBakeDescriptor({
    chunkX: 0, chunkZ: 0, quality: 'balanced', revisions: { world: 0, tile: 0, height: 0, water: 0, canopy: 0 },
  });
  const result = (await bakeTerrainMaterialPage({
    source, descriptor, config: bakeConfig, chunkSize, tileSize: 2, worldSeed: 55, yieldControl: async () => {},
  })).value;
  // Concave toe row (x = 4, where slope transitions upward) gains talus rock byte > 0.
  const toeOffset = (4 * result.resolution + 4) * 4;
  assert.ok(result.channels.materialWeights[toeOffset + 2] > 0, 'concave toe gains talus rock weight');
});

test('TerrainMicrogeometryNodes compiles cleanly inside createTerrainMaterial', () => {
  const editor = loadYaml('../editor.config.yaml');
  const bakeSource = loadYaml('../config/terrain-material-bake.yaml');
  const looks = loadBiomeLooks();
  applyBiomeLooks(editor, bakeSource, looks);
  editor.stylizedSurface.environment = resolveEnvironmentalFieldConfig(
    loadYaml('../config/environmental-fields.yaml'),
    '',
  );
  editor.stylizedSurface.materialBake = createTerrainMaterialBakeConfig(bakeSource);

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
  assert.ok(material.colorNode && material.normalNode);
  material.dispose();
});

test('AlpineRockView and alpineRockField suppress giant crags on lowland mounds and add shoulders + scree on true mountains', () => {
  // 1. Lowland Tundra mound (~200 m height inside 15 m mound, 0 macro slope at 40 m): must NOT spawn giant crag spires.
  const lowlandTerrainView = {
    floatingOrigin: { getState: () => ({ x: 0, y: 0, z: 0 }) },
    worldStore: { tileSize: 2, chunkSize: 16, getTile: () => 11 },
    getCanonicalHeight: (x, z) => {
      const r = Math.hypot(x - 6, z - 6);
      return 200 + Math.max(0, 12 - r) * 1.1;
    },
  };
  const snowGround = [];
  snowGround[11] = 1;
  const view = new AlpineRockView({
    scene: new THREE.Scene(),
    terrainView: lowlandTerrainView,
    snowGroundByTile: snowGround,
    seaLevel: 0,
  });
  const flatGround = view.groundAt(0, 0);
  assert.equal(flatGround.allowed, true);
  assert.equal(flatGround.snow, 1);
  assert.ok(flatGround.mountainFactor < 0.22, `lowland mountainFactor ${flatGround.mountainFactor} should stay < 0.22`);

  let lowlandCrags = [];
  for (let cx = -3; cx <= 3 && !lowlandCrags.length; cx += 1) {
    const res = alpineRocksInCell(cx, 0, () => ({
      allowed: true,
      slope: 0.75,
      height: 205,
      dx: 0.75,
      dz: 0,
      snow: 1,
      mountainFactor: 0.05,
      screeFactor: 0,
    }));
    if (res) lowlandCrags = res;
  }
  assert.ok(lowlandCrags.length > 0);
  for (const r of lowlandCrags) {
    assert.ok(r.scale <= 3.5, `lowland mound rock scale ${r.scale} must stay <= 3.5`);
    assert.ok((r.burial ?? 0) >= 0.44, 'lowland mound rocks must sit deeply buried');
  }

  // 2. Real high mountain slope + scree apron spawns connected shoulders and graded scree fans.
  let mountainGroup = null;
  for (let cx = 0; cx < 12 && !mountainGroup; cx += 1) {
    mountainGroup = alpineRocksInCell(cx, 2, () => ({
      allowed: true,
      slope: 0.7,
      height: 680,
      dx: 0.6,
      dz: 0.35,
      snow: 0.85,
      mountainFactor: 0.85,
      screeFactor: 0.55,
    }));
  }
  assert.ok(mountainGroup && mountainGroup.length >= 3, 'real mountain cell must emit primary crag + connected shoulders/scree');

  let toeScree = null;
  for (let cx = 0; cx < 16 && !toeScree; cx += 1) {
    toeScree = alpineRocksInCell(cx, -3, () => ({
      allowed: true,
      slope: 0.25,
      height: 410,
      dx: 0.2,
      dz: 0.15,
      snow: 0.2,
      mountainFactor: 0.4,
      screeFactor: 0.65,
    }));
  }
  assert.ok(toeScree && toeScree.length >= 3, 'concave mountain toe must emit graded scree fan');
});
