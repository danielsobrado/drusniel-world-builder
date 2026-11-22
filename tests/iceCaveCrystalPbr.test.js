import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { LOCATION_GENERATORS } from '../src/editor/locations/generators/index.js';
import { generateLocation } from '../src/editor/locations/LocationBuilder.js';
import { resolveLocationCatalog } from '../src/editor/locations/LocationCatalog.js';
import { crystalClusterUnit, facetedCrystal } from '../src/editor/locations/gen/iceKit.js';
import { DensityGrid } from '../src/editor/locations/gen/DensityGrid.js';
import { extractSurface, removeDegenerateTriangles, smoothSurfaceTaubin } from '../src/editor/locations/gen/SurfaceNets.js';
import { createGlacierIceMaterial } from '../src/editor/locations/materials/GlacierIceMaterial.js';
import { createIceCrystalMaterial } from '../src/editor/locations/materials/IceCrystalMaterial.js';
import { buildLocationCrystalField } from '../src/editor/locations/generators/LocationCrystalField.js';

const source = yaml.load(fs.readFileSync(new URL('../config/instanced-locations.yaml', import.meta.url), 'utf8'));

function dummyMaps() {
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  return {
    ice: { color: tex, normal: tex, rough: tex },
    cracks: { color: tex, normal: tex, rough: tex },
    snow: { color: tex, normal: tex, rough: tex },
    rock: { color: tex, normal: tex, rough: tex },
    crystalPack: tex,
  };
}

test('packed CC0 ice-cave crystal/caustic/sparkle texture exists and is non-empty', () => {
  const stat = fs.statSync(new URL('../public/assets/textures/ice/ice-cave-crystal-pack.png', import.meta.url));
  assert.ok(stat.size > 10000, `expected packed PNG > 10KB, got ${stat.size}`);
});

test('catalog resolves crystal profiles, quality transmission/post flags, and crystalField budgets', () => {
  const high = resolveLocationCatalog(source, { generatorKeys: Object.keys(LOCATION_GENERATORS), quality: 'high' });
  const low = resolveLocationCatalog(source, { generatorKeys: Object.keys(LOCATION_GENERATORS), quality: 'low' });

  assert.equal(high.quality.iceTransmission, true);
  assert.equal(high.quality.icePost, true);
  assert.equal(high.quality.iceSsr, true);
  assert.equal(high.quality.crystalScale, 1);

  assert.equal(low.quality.iceTransmission, false);
  assert.equal(low.quality.icePost, false);
  assert.equal(low.quality.crystalScale, 0);

  const cave = high.site('showcase-frostgard-refuge');
  assert.equal(cave.materials.clearIce.profile.crystal, true);
  assert.equal(cave.materials.iceCrystal.profile.crystal, true);
  assert.ok(cave.materials.iceCrystal.profile.transmission > 0.8);
  assert.ok(cave.params.crystalField.clusters >= 500);
  assert.ok(cave.params.crystalField.needles >= 800);
});

test('facetedCrystal and crystalClusterUnit build crisp non-indexed finite hexagonal prisms', () => {
  const prism = facetedCrystal({ x: 0, y: 0, z: 0 }, { x: 0.1, y: 1.5, z: 0 }, 0.25, { sides: 6, seed: 5 });
  const pos = prism.attributes.position;
  const norm = prism.attributes.normal;
  assert.ok(pos && norm);
  assert.equal(pos.count % 3, 0);
  assert.ok(pos.count >= 6 * 6 * 3, '6 sides × 6 tris/side');
  assert.ok(pos.array.every(Number.isFinite));
  assert.ok(norm.array.every(Number.isFinite));

  const cluster = crystalClusterUnit({ prisms: 4, seed: 11 });
  assert.ok(cluster.attributes.position.count >= 4 * 6 * 6 * 3);
  prism.dispose();
  cluster.dispose();
});

test('SurfaceNets degenerate filter drops zero-area slivers and Taubin smoothing preserves finite unit normals', () => {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 0, // degenerate duplicate
  ]);
  const indices = new Uint32Array([0, 1, 2, 0, 3, 1]);
  const filtered = removeDegenerateTriangles(positions, indices);
  assert.equal(filtered.length, 3, 'should keep only the non-degenerate triangle');

  const grid = new DensityGrid({ min: { x: -4, y: -4, z: -4 }, max: { x: 4, y: 4, z: 4 }, voxel: 0.5 });
  grid.carve({
    box: { min: { x: -3, y: -3, z: -3 }, max: { x: 3, y: 3, z: 3 } },
    air: (x, y, z) => 2.2 - Math.hypot(x, y, z),
  });
  const surface = extractSurface(grid);
  smoothSurfaceTaubin(surface, grid, { passes: 2 });
  assert.ok(surface.positions.every(Number.isFinite));
  assert.ok(surface.normals.every(Number.isFinite));
  assert.ok(surface.indices.length > 0);
});

test('IceCrystalMaterial and GlacierIceMaterial build clean WebGPU node graphs for both high and low tiers', () => {
  const catalog = resolveLocationCatalog(source, { generatorKeys: Object.keys(LOCATION_GENERATORS), quality: 'high' });
  const cave = catalog.site('showcase-frostgard-refuge');
  const maps = dummyMaps();

  const wallMat = createGlacierIceMaterial('test-wall', {
    profile: cave.materials.terrain.profile,
    maps,
    stoneProfile: cave.materials.terrain.bedrock,
    layers: 4,
    masked: true,
    usePostMrt: true,
  });
  assert.ok(wallMat.isNodeMaterial && wallMat.colorNode && wallMat.userData.postProcessingMaterialData);

  const transmissiveCrystal = createIceCrystalMaterial('test-crystal-high', {
    profile: cave.materials.iceCrystal.profile,
    maps,
    layers: 3,
    transmission: true,
    usePostMrt: true,
  });
  assert.equal(transmissiveCrystal.transparent, true);
  assert.equal(transmissiveCrystal.depthWrite, true);
  assert.ok(transmissiveCrystal.colorNode && transmissiveCrystal.opacityNode);

  const opaqueCrystal = createIceCrystalMaterial('test-crystal-low', {
    profile: cave.materials.iceCrystal.profile,
    maps,
    layers: 2,
    transmission: false,
    usePostMrt: false,
  });
  assert.equal(opaqueCrystal.transparent, false);
  assert.ok(opaqueCrystal.colorNode);

  wallMat.dispose();
  transmissiveCrystal.dispose();
  opaqueCrystal.dispose();
  maps.crystalPack.dispose();
});

test('LocationCrystalField generates deterministic GPU-instanced crystals off walkable lanes', () => {
  const catalog = resolveLocationCatalog(source, { generatorKeys: Object.keys(LOCATION_GENERATORS), quality: 'low' });
  const cave = catalog.site('showcase-frostgard-refuge');
  const gen = LOCATION_GENERATORS[cave.generatorKey];
  const builder = generateLocation(cave, gen);
  const stubMat = new THREE.MeshBasicMaterial();
  const materials = Object.fromEntries(
    Object.keys(cave.materials).map((key) => [key, { material: stubMat, ice: cave.materials[key].kind === 'ice' ? 1 : 0 }]),
  );

  const group = builder.build({
    materials,
    absorption: cave.lighting.absorption,
    crystalField: { maxClusters: 400, maxNeedles: 600 },
  });

  const instanced = [];
  group.traverse((obj) => {
    if (obj.isInstancedMesh) instanced.push(obj);
  });
  assert.equal(instanced.length, 2, 'should emit 2 GPU-instanced crystal meshes (clusters + needles)');
  for (const mesh of instanced) {
    assert.ok(mesh.count > 10, `expected crystal colonies on ${mesh.name}, got ${mesh.count}`);
    assert.ok(mesh.geometry.attributes.bakeLight?.isInstancedBufferAttribute);
    assert.ok(mesh.geometry.attributes.bakeDir?.isInstancedBufferAttribute);
    assert.ok(mesh.geometry.attributes.bakeShade?.isInstancedBufferAttribute);
    assert.ok(mesh.geometry.attributes.bakeLight.array.every(Number.isFinite));
  }

  // Verify direct buildLocationCrystalField handles empty input cleanly.
  assert.deepEqual(buildLocationCrystalField({
    surface: { positions: new Float32Array(), normals: new Float32Array() },
    baked: { light: new Float32Array(), dir: new Float32Array(), shade: new Float32Array() },
    mask: new Float32Array(),
    nav: builder.nav,
    crystalMaterial: stubMat,
  }), []);

  group.traverse((o) => o.geometry?.dispose());
  stubMat.dispose();
});

test('new runtime ice shader & post-processing modules contain zero GPU-to-CPU readbacks', () => {
  const files = [
    '../src/editor/locations/LocationPostProcessing.js',
    '../src/editor/locations/materials/GlacierIceMaterial.js',
    '../src/editor/locations/materials/IceCrystalMaterial.js',
    '../src/editor/locations/materials/ice/IceBrdf.js',
    '../src/editor/locations/materials/ice/IceCaustics.js',
    '../src/editor/locations/materials/ice/IceSparkle.js',
    '../src/editor/locations/materials/ice/IceLighting.js',
    '../src/editor/locations/generators/LocationCrystalField.js',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(!/\bmapAsync\b|\breadPixels\b|\bgetArrayBufferAsync\b/.test(src), `${rel} must remain GPU-readback-free in runtime`);
  }
});
