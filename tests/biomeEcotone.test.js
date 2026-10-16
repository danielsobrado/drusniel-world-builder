import assert from 'node:assert/strict';
import test from 'node:test';
import { createMacroAtlasPayload } from '../src/editor/import/AzgaarMacroWorldSource.js';
import { createAzgaarBiomeDefinitions } from '../src/editor/AzgaarBiomeCatalog.js';
import { AzgaarMacroWorldGenerator } from '../src/editor/world/AzgaarMacroWorldGenerator.js';
import { createBiomeBoundaryWarp } from '../src/editor/world/BiomeBoundaryWarp.js';
import {
  ecotoneJitter,
  grassPatchCover,
  grassStandDensity,
} from '../src/editor/world/GrassPatchiness.js';
import {
  buildSurfaceMaskPixels,
  createSurfaceMaskConfig,
} from '../src/editor/world/ChunkRenderPixels.js';

const WATER = 0;
const GRASSLAND = 4;
const DECIDUOUS = 6;

/** Four 64-cell texels across: sea, grassland, deciduous, grassland. */
function wideTexelSource() {
  const width = 4;
  const height = 4;
  const row = [0, 60, 60, 60];
  const biomes = [0, GRASSLAND, DECIDUOUS, GRASSLAND];
  return {
    kind: 'azgaar-macro-v1',
    version: 1,
    source: { mapId: 'ecotone-test', seed: 'abc' },
    atlas: {
      width,
      height,
      ...createMacroAtlasPayload({
        heights: Uint8Array.from([...row, ...row, ...row, ...row]),
        biomes: Uint8Array.from([...biomes, ...biomes, ...biomes, ...biomes]),
        features: Uint16Array.from(new Array(16).fill(1)),
      }),
    },
    physical: { widthMeters: 512, heightMeters: 512, distanceScale: 1, distanceUnit: 'km' },
    bounds: { minCellX: 0, minCellZ: 0, widthCells: 256, heightCells: 256 },
    oceanTransitionCells: 4,
    terrain: { minHeight: -16, maxHeight: 48, seaLevel: -1.5 },
    biomes: createAzgaarBiomeDefinitions(),
    rivers: [],
  };
}

const metadata = { seed: 91, version: 1, heightScale: 12, seaLevel: -1.5 };

test('the boundary warp is deterministic, bounded, and off for fine atlases', () => {
  const warp = createBiomeBoundaryWarp({ seed: 7, cellsPerTexel: 4000 });
  const a = warp(1234.5, -987.5, { x: 0, z: 0 });
  const b = warp(1234.5, -987.5, { x: 0, z: 0 });
  assert.deepEqual(a, b);
  // Octave amplitudes sum to under half the coarsest wavelength.
  for (let i = 0; i < 200; i += 1) {
    const offset = warp(i * 911.3, i * -377.9, { x: 0, z: 0 });
    assert.ok(Math.abs(offset.x) < 0.5 * 1.5 * 4000 && Math.abs(offset.z) < 0.5 * 1.5 * 4000);
  }
  assert.equal(createBiomeBoundaryWarp({ seed: 7, cellsPerTexel: 1 }), null);
});

test('an Azgaar biome border bends instead of following the atlas grid', () => {
  const generator = new AzgaarMacroWorldGenerator(wideTexelSource(), metadata);
  // The grassland/deciduous texel border sits at cell x = 128.
  const crossings = new Set();
  for (let z = 4; z < 252; z += 4) {
    let switchX = null;
    for (let x = 70; x < 186; x += 1) {
      if (generator.sampleTile(x, z) === DECIDUOUS) { switchX = x; break; }
    }
    assert.notEqual(switchX, null, `row ${z} reaches the deciduous texel`);
    crossings.add(switchX);
  }
  assert.ok(crossings.size > 8, `the border wanders (${crossings.size} distinct crossings)`);
});

test('the warp never moves water: land stays land, sea stays sea', () => {
  const generator = new AzgaarMacroWorldGenerator(wideTexelSource(), metadata);
  for (let z = 2; z < 254; z += 6) {
    // Deep inside the sea texel, and on land right next to it.
    assert.equal(generator.sampleTile(20, z), WATER);
    for (let x = 66; x < 90; x += 3) {
      assert.notEqual(generator.sampleTile(x, z), WATER, `cell ${x}:${z} is land`);
    }
  }
});

test('thin grass grows in islands; a full sward is untouched', () => {
  let island = 0;
  let bare = 0;
  for (let x = 0; x < 120; x += 1) {
    for (let z = 0; z < 120; z += 1) {
      assert.equal(grassPatchCover(x, z, 0.98, 3), 1);
      const cover = grassPatchCover(x, z, 0.28, 3);
      if (cover > 0.9) island += 1;
      if (cover < 0.1) bare += 1;
    }
  }
  assert.ok(island > 1000 && bare > 4000, `islands ${island}, bare ${bare}`);
  assert.equal(grassStandDensity(5, 5, 0.98, 3), 0.98);
  assert.ok(grassStandDensity(5, 5, 0.28, 3) <= 1);
});

test('the ecotone jitter is deterministic and favours a stem\'s own cell', () => {
  const out = { x: 0, z: 0 };
  let own = 0;
  for (let i = 0; i < 2000; i += 1) {
    ecotoneJitter(i * 0.37, i * -0.53, 0.9, out);
    assert.ok(Math.abs(out.x) <= 0.9 && Math.abs(out.z) <= 0.9);
    if (Math.abs(out.x) < 0.5 && Math.abs(out.z) < 0.5) own += 1;
  }
  assert.ok(own > 1000, `${own} of 2000 stay near their own cell`);
  const a = ecotoneJitter(3.25, -7.5, 0.9, { x: 0, z: 0 });
  assert.deepEqual(ecotoneJitter(3.25, -7.5, 0.9, { x: 0, z: 0 }), a);
});

test('the surface mask bakes bare ground between thin grass, not under a sward', () => {
  const maskConfig = {
    ...createSurfaceMaskConfig({ grass: { tileIds: [4, 10], meadow: {} } }, { tileSize: 2 }),
    worldSeed: 5,
  };
  const chunkSize = 32;
  const coverageOf = (tileId) => {
    const tiles = new Uint8Array(chunkSize * chunkSize).fill(tileId);
    const mask = buildSurfaceMaskPixels({
      tiles, originX: 0, originZ: 0, chunkSize, sampleTile: () => tileId, maskConfig,
    });
    return Array.from({ length: chunkSize * chunkSize }, (_, cell) => mask[cell * 4 + 1]);
  };
  assert.ok(coverageOf(GRASSLAND).every((value) => value === 255), 'grassland stays full');
  const tundra = coverageOf(10);
  assert.ok(tundra.some((value) => value < 40) && tundra.some((value) => value > 230), 'tundra is patchy');
});

test('biome snow fades across a border, and the page field matches point queries', async () => {
  const { snowBiomeCoverField, snowBiomeCoverAt, SNOW_BIOME_BLUR_CELLS } = await import('../src/editor/materials/SnowAccumulation.js');
  const cover = { 10: 0.35, 11: 1 };
  const tileAt = (x) => (x >= 20 ? 11 : 4);
  const size = 40;
  const halo = Uint8Array.from({ length: size * size }, (_, i) => tileAt(i % size));
  const field = snowBiomeCoverField(halo, size, cover);
  const row = 20;
  const ramp = [];
  for (let x = SNOW_BIOME_BLUR_CELLS; x < size - SNOW_BIOME_BLUR_CELLS; x += 1) {
    const value = field[row * size + x];
    assert.ok(Math.abs(value - snowBiomeCoverAt(tileAt, x, row, cover)) < 1e-6, `cell ${x} agrees`);
    ramp.push(value);
  }
  assert.ok(ramp.every((value, i) => i === 0 || value >= ramp[i - 1] - 1e-9), 'monotonic ramp');
  assert.equal(ramp[0], 0);
  assert.ok(Math.abs(ramp.at(-1) - 1) < 1e-9);
  assert.ok(ramp.filter((value) => value > 0.05 && value < 0.95).length >= 6, 'a ramp, not a step');
});

test('a sward fades wide into barren land but keeps its grass to the water and the road', () => {
  const maskConfig = { ...createSurfaceMaskConfig({ grass: { tileIds: [4] } }, { tileSize: 2 }), worldSeed: 5 };
  const chunkSize = 32;
  const coverageAt = (neighbour, x) => {
    const tileAt = (cellX) => (cellX < 0 ? neighbour : GRASSLAND);
    const tiles = Uint8Array.from({ length: chunkSize * chunkSize }, (_, i) => tileAt(i % chunkSize - 8));
    const mask = buildSurfaceMaskPixels({ tiles, originX: -8, originZ: 0, chunkSize, sampleTile: tileAt, maskConfig });
    return mask[(16 * chunkSize + 8 + x) * 4 + 1] / 255;
  };
  // Five cells (10 m) in from the edge.
  assert.equal(coverageAt(WATER, 5), 1, 'shore grass is full 10 m from the water');
  assert.equal(coverageAt(13, 5), 1, 'a road verge has its own blend');
  assert.ok(coverageAt(1, 5) < 0.7, 'still thinning 10 m from a desert');
});

test('a thin biome\'s grass islands thin in across the border, not at it', () => {
  const maskConfig = {
    ...createSurfaceMaskConfig({ grass: { tileIds: [4, 10], meadow: {} } }, { tileSize: 2 }),
    worldSeed: 9,
  };
  const chunkSize = 64;
  const tileAt = (cellX) => (cellX < 32 ? GRASSLAND : 10);
  const tiles = Uint8Array.from({ length: chunkSize * chunkSize }, (_, i) => tileAt(i % chunkSize));
  const mask = buildSurfaceMaskPixels({ tiles, originX: 0, originZ: 0, chunkSize, sampleTile: tileAt, maskConfig });
  const column = (x) => {
    let sum = 0;
    for (let z = 0; z < chunkSize; z += 1) sum += mask[(z * chunkSize + x) * 4 + 1];
    return sum / chunkSize / 255;
  };
  // Grassland just before the border, tundra just after it, and deep tundra.
  assert.ok(column(30) > 0.9, 'grassland stays full up to the border');
  assert.ok(column(33) > column(44) + 0.15, `tundra thins in (${column(33).toFixed(2)} vs ${column(44).toFixed(2)})`);
});
