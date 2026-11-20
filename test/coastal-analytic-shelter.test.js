import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { float, uniform, vec2 } from 'three/tsl';
import { createTerrainWaterContext } from '../src/editor/stylized/TerrainOceanMask.js';
import { createCoastSwashNodes, createCoastPatternOrigins, DEFAULT_COAST_SWASH } from '../src/editor/stylized/CoastSwashShading.js';
import { resolveSeaDiffraction, createSeaDiffractionSampler } from '../src/editor/water/SeaDiffraction.js';
import { seaExposure } from '../src/editor/water/WaterAppearance.js';

test('coastal terrain context exposes optional shelter from the existing water appearance', () => {
  const uv = vec2(0.5, 0.5), ground = float(0.3);
  const sheltered = createTerrainWaterContext(uv, ground, 33, true);
  const original = createTerrainWaterContext(uv, ground, 33);
  const highBeach = createTerrainWaterContext(uv, ground, 33, true, 5);
  for (const key of ['ocean', 'organic', 'cold', 'wet', 'damp']) {
    assert.equal(typeof sheltered[key].mul, 'function', key);
    assert.equal(typeof original[key].mul, 'function', key);
  }
  assert.equal(typeof sheltered.shelter.mul, 'function');
  assert.equal(typeof highBeach.shelter.mul, 'function');
  assert.equal(typeof original.shelter.mul, 'function');
  const patterns = createCoastPatternOrigins();
  patterns.update(-4226432, 278528);
  const diffraction = resolveSeaDiffraction({ enabled: true });
  const swash = createCoastSwashNodes({
    localXZ: vec2(2, 5), patternOrigins: patterns,
    groundHeight: ground, oceanMask: sheltered.ocean, shelter: sheltered.shelter,
    config: DEFAULT_COAST_SWASH, clock: uniform(4), diffraction, persistentEnabled: false,
  });
  assert.equal(typeof swash.film.mul, 'function');
  assert.equal(typeof swash.foam.mul, 'function');
  assert.equal(typeof swash.wet.mul, 'function');
  assert.equal(typeof swash.apply(float(1), float(0.8)).roughness.mul, 'function');
});

test('world-coherent ocean exposure supplies bounded shelter at open coast and behind headlands', () => {
  const settings = resolveSeaDiffraction({ enabled: true });
  const open = createSeaDiffractionSampler({
    sampleWater: () => ({ kind: 1, coverage: 1 }), tileSizeMeters: 2, settings,
  });
  const rock = createSeaDiffractionSampler({
    sampleWater: (cellX, cellZ) => {
      const x = cellX * 2, z = -cellZ * 2;
      const blocked = x >= 28 && x <= 48 && Math.abs(z) < 38;
      return { kind: blocked ? 0 : 1, coverage: blocked ? 0 : 1 };
    },
    tileSizeMeters: 2, settings,
  });
  for (const shore of [0, 4, 12, 36, 48]) {
    assert.equal(open(0, 0, shore), 1);
    assert.ok(rock(0, 0, shore) >= settings.minimumTransmission);
    assert.ok(rock(0, 0, shore) <= 1);
    assert.ok(seaExposure(shore) > 0);
  }
  assert.ok(rock(0, 0, 12) < 0.5);
  assert.equal(rock(0, 0, 200), 1);
});

test('shader integration uses existing sampler-free field only when configured', async () => {
  const paths = {
    context: '../src/editor/stylized/TerrainOceanMask.js',
    terrain: '../src/editor/terrainMaterial.js',
    swash: '../src/editor/stylized/CoastSwashShading.js',
    material: '../src/editor/stylized/StylizedWaterMaterial.js',
  };
  const entries = await Promise.all(Object.entries(paths).map(async ([key, name]) => [
    key, await readFile(new URL(name, import.meta.url), 'utf8'),
  ]));
  const { context, terrain, swash, material } = Object.fromEntries(entries);
  assert.equal((context.match(/bilinearTexels\(emptyAppearance, fieldUv, readAppearance\)/g) ?? []).length, 1);
  assert.match(context, /const samples = texels\.map\(value => value\.toVar\(\)\)/);
  assert.match(context, /createSeaShelterNode\(relative, max\(field\.a, 0\)\)/);
  assert.match(context, /if \(shelteredSurf\)/);
  assert.match(context, /height\.lessThan\(shelterHeightLimit\)/);
  assert.match(terrain, /diffraction\?\.enabled === true/);
  assert.match(terrain, /stylizedConfig\.water\?\.coast\?\.runupHeight \?\? DEFAULT_COAST_SWASH\.runupHeight/);
  assert.match(terrain, /shelter: waterContext\?\.shelter \?\? float\(1\)/);
  assert.match(swash, /runupScale: shelter, phaseLag/);
  assert.match(swash, /SEA_SWELL_COMPONENTS\[0\]\.waveNumber \* diffraction\.phaseLagMeters/);
  assert.match(material, /diffraction: water\.sea\?\.surf\?\.diffraction/);
  assert.equal((context.match(/new DataTexture\(/g) ?? []).length, 2, 'only pre-existing fallback textures');
  assert.doesNotMatch(context, /new (?:THREE\.)?StorageTexture/);
  assert.doesNotMatch(terrain, /new (?:THREE\.)?(?:DataTexture|StorageTexture)/);
});
