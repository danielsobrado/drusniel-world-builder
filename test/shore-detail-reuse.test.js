import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { createOceanDistanceField } from '../src/editor/water/OceanDistanceField.js';
import { generatePreparedPlacementChunk } from '../src/editor/world/PreparedPlacementChunk.js';
import { evaluateShoreHabitat, SHORE_HABITATS } from '../src/editor/stylized/shoreHabitat.js';
import { fitRockToGround } from '../src/editor/stylized/rockGroundFit.js';
import { rockWaterContact } from '../src/editor/stylized/localRockWater.js';
import { lakeWaveHeight, lakeWavePhases, LAKE_WAVES } from '../src/editor/water/LakeSurfaceWaves.js';
import { createWaterPatternOrigins } from '../src/editor/stylized/WaterPatternOrigins.js';
import { installSurfaceAnisotropy, isSurfaceTexture, resolveSurfaceAnisotropy } from '../src/render/SurfaceAnisotropyController.js';
import { createInstancedRenderers, writeInstances } from '../src/editor/stylized/lod/StylizedLodRuntime.js';
import { StylizedSurfaceView as StylizedSurfaceViewBase } from '../src/editor/stylized/StylizedSurfaceViewBase.js';
import { plantSwayTime } from '../src/editor/stylized/plantSway.js';
import { setUnderwaterBlend } from '../src/editor/water/underwaterState.js';

test('worker and fallback ocean distances agree across chunk borders and exclude inland lakes', () => {
  const generator = { sampleTile: x => x < 0 || x >= 30 ? 0 : 6,
    sampleHeight: () => 0.5, sampleWater: x => ({ kind: x < 0 ? 1 : x >= 30 ? 2 : 0 }) };
  const view = { worldStore: { tileSize: 2, chunkSize: 8, generator }, tileMap: { get: generator.sampleTile } };
  const fallback = createOceanDistanceField(view, 16);
  const pages = new Map();
  view.preparedPlacement = { field: (_, x, z) => {
    const key = `${x}:${z}`;
    if (!pages.has(key)) pages.set(key, generatePreparedPlacementChunk({ chunkX: x, chunkZ: z, chunkSize: 8,
      placementSamplingConfig: { targets: [{ label: 'coast', maxCells: 8, targetTileId: 0, oceanOnly: true }] } }, generator));
    return pages.get(key).fields.coast;
  } };
  const prepared = createOceanDistanceField(view, 16);
  // Give the first field a view without preparation to exercise both paths.
  fallback.preparedProvider = null;
  for (const x of [-0.01, 0, 2, 15.99, 16, 18, 58, 62]) for (const z of [-0.01, 0, 16]) {
    assert.equal(prepared.worldDistanceAt(x, z), fallback.worldDistanceAt(x, z));
  }
  assert.equal(prepared.worldDistanceAt(62, 0), Infinity, 'a lake is not a coastal source');
});

test('beach species cluster on damp coastal slopes and reject water, cliffs and inland ground', () => {
  const providers = { distanceAt: () => 2, heightAt: x => 0.3 + x * 0.1,
    waterAt: () => ({ kind: 0 }), seaLevel: 0 };
  const accepted = [];
  for (let x = 0; x < 100; x++) {
    const candidate = { x, z: 0, height: 0.3 };
    const result = evaluateShoreHabitat(candidate, SHORE_HABITATS.starfish, providers);
    if (result) accepted.push(result);
  }
  assert.ok(accepted.length > 0 && accepted.length < 80, 'patches leave bare sand');
  assert.ok(accepted.every(result => Math.abs(result.groundNormal[0] + 0.1 / Math.hypot(0.1, 1)) < 1e-12));
  const candidate = { x: 0, z: 0, height: 0.3 };
  for (const changes of [{ distanceAt: () => Infinity }, { heightAt: x => x * 3 },
    { waterAt: () => ({ kind: 2, coverage: 1 }) }]) {
    assert.equal(evaluateShoreHabitat(candidate, SHORE_HABITATS.starfish, { ...providers, ...changes }), null);
  }
});

test('boulders seat toward their lowest support and reject unsupported cliffs at their actual size', () => {
  const placement = { x: 10, z: 4, scale: 2 };
  assert.deepEqual(fitRockToGround(placement, 3, () => 6), { groundFitHeight: 6 });
  const result = fitRockToGround(placement, 3, x => x * 0.5);
  assert.ok(Math.abs(result.groundFitHeight - (5 - 2.7 * 0.5 * 0.7)) < 1e-12);
  assert.equal(fitRockToGround(placement, 3, x => x < 10 ? -10 : 10), null);
  assert.equal(fitRockToGround(placement, 3, () => NaN), null);
});

test('local rock waterlines use nearby lake and river levels without wetting dry inland rocks', () => {
  const rock = { x: 0, z: 0, scale: 1 };
  assert.deepEqual(rockWaterContact(rock, 3, () => ({ kind: 0, surfaceHeight: 40 })), [0, 0, 0]);
  for (const kind of [1, 2, 3]) {
    assert.deepEqual(rockWaterContact(rock, 3, x => x > 1 ? { kind, coverage: 1, surfaceHeight: 40, fall: 0.2 } : { kind: 0 }), [40, 1, 0.2]);
  }
  let calls = 0;
  assert.deepEqual(rockWaterContact(rock, 3, () => {
    calls++; return { kind: 2, coverage: 1, surfaceHeight: 40 };
  }), [40, 1, 0]);
  assert.equal(calls, 1, 'submerged rocks do not query eight further points');
});

test('pad and water phases agree at planet scale and do not change when an anchor moves', () => {
  const x = 2_000_001.13, z = -3_000_002.39;
  const patterns = createWaterPatternOrigins({ sea: {}, noiseScale: 0.1, scale: 1 });
  for (const [cx, cz] of [[2_000_000, -3_000_000], [2_004_096, -3_004_096]]) {
    patterns.update(cx, cz);
    for (const seconds of [0, 1.5, 7]) {
      const waterRise = LAKE_WAVES.reduce((sum, wave, i) => sum + Math.sin(
        patterns.uniforms[`lakeWave${i}`].value + (x - cx) * wave.x + (z - cz) * wave.z - seconds * wave.speed,
      ) * wave.height, 0);
      assert.ok(Math.abs(waterRise - lakeWaveHeight(x, z, seconds)) < 1e-10);
      assert.ok(lakeWavePhases(x, z).every(phase => phase >= 0 && phase < Math.PI * 2));
    }
  }
});

test('surface instance metadata uploads only changed records and survives rebases', () => {
  const root = new THREE.Group();
  const source = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardNodeMaterial();
  const meshes = createInstancedRenderers({ root, capacity: 2, name: 'surface-test',
    partsByPrototype: [[{ geometry: source, material, instanceSurface: true }]] });
  const records = [{ matrix: new THREE.Matrix4().makeTranslation(1e6, 40, -1e6), fade: 1, seed: 0.1,
    surfaceData: [40, 1, 0] }];
  writeInstances(meshes, [records], { x: 1e6, z: -1e6 });
  const attribute = meshes[0][0].geometry.getAttribute('instanceSurface');
  const version = attribute.version;
  attribute.clearUpdateRanges();
  writeInstances(meshes, [records], { x: 1e6 + 4096, z: -1e6 });
  assert.equal(attribute.version, version);
  assert.equal(attribute.updateRanges.length, 0);
  records[0].surfaceData = [52, 1, 0];
  writeInstances(meshes, [records]);
  assert.deepEqual(attribute.updateRanges, [{ start: 0, count: 3 }]);
});

test('aquatic animation continues on the water clock while underwater land preparation is suspended', t => {
  const previous = plantSwayTime.value;
  t.after(() => { plantSwayTime.value = previous; setUnderwaterBlend(0); });
  const view = Object.create(StylizedSurfaceViewBase.prototype);
  view.enabled = true; view.beginFrame = () => {};
  let waterTime = 0;
  view.waterSlots = [{ update: timestamp => { waterTime = timestamp / 1000; } }];
  setUnderwaterBlend(1); view.update(56789, null);
  assert.equal(plantSwayTime.value, waterTime);
  assert.equal(waterTime, 56.789);
});

test('anisotropy covers streamed TSL surfaces, respects GPU limits and leaves data fields alone', async () => {
  const map = new THREE.Texture(); map.minFilter = THREE.LinearMipmapLinearFilter;
  const field = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  field.minFilter = THREE.LinearMipmapLinearFilter;
  assert.equal(isSurfaceTexture(field), false);
  assert.equal(resolveSurfaceAnisotropy({ level: 16 }, 8), 8);
  assert.equal(resolveSurfaceAnisotropy({ enabled: false }), 1);
  const prior = () => {};
  const renderer = { debug: { onNodeBuilderCreated: prior }, getMaxAnisotropy: () => 8 };
  const policy = installSurfaceAnisotropy(renderer, { level: 16 });
  for (const async of [false, true]) {
    const builder = { uniforms: { fragment: [{ node: { value: map } }, { node: { value: field } }] },
      build() {}, async buildAsync() {} };
    renderer.debug.onNodeBuilderCreated(builder, {});
    if (async) await builder.buildAsync(); else builder.build();
    assert.equal(map.anisotropy, 8); assert.equal(field.anisotropy, 1);
  }
  policy.dispose(); assert.equal(renderer.debug.onNodeBuilderCreated, prior);
});
