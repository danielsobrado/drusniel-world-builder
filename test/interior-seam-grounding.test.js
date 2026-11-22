import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { DensityGrid } from '../src/editor/locations/gen/DensityGrid.js';
import { SHADE_SIZE, bakeLighting } from '../src/editor/locations/gen/LightBake.js';
import { PropOcclusionGrid } from '../src/editor/locations/gen/PropOcclusionGrid.js';
import { generateLocation } from '../src/editor/locations/LocationBuilder.js';
import { resolveLocationCatalog } from '../src/editor/locations/LocationCatalog.js';
import { LOCATION_GENERATORS } from '../src/editor/locations/generators/index.js';
import { createGlacierIceMaterial } from '../src/editor/locations/materials/GlacierIceMaterial.js';
import { createIceCrystalMaterial } from '../src/editor/locations/materials/IceCrystalMaterial.js';
import { createStoneMaterial } from '../src/editor/locations/materials/StoneSurface.js';
import { createWaterfallMaterial } from '../src/editor/locations/materials/WaterfallMaterial.js';
import { buildShader } from './helpers/buildShader.js';

const loadCatalog = () => resolveLocationCatalog(
  yaml.load(fs.readFileSync(new URL('../config/instanced-locations.yaml', import.meta.url), 'utf8')),
  { generatorKeys: Object.keys(LOCATION_GENERATORS) },
);

const dummyMaps = () => ({ color: new THREE.Texture(), normal: new THREE.Texture(), rough: new THREE.Texture() });

function makeBoxTriangles(cx, cy, cz, sx, sy, sz) {
  const geom = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  geom.translate(cx, cy, cz);
  const pos = new Float32Array(geom.attributes.position.array);
  geom.dispose();
  return pos;
}

test('PropOcclusionGrid.contactMetrics detects 3D prop-to-terrain and prop-to-prop seams', () => {
  // Floor at y = 0 (solid below y < 0, open air above y > 0).
  const grid = new DensityGrid({ min: { x: -4, y: -2, z: -4 }, max: { x: 4, y: 6, z: 4 }, voxel: 0.5 });
  grid.carve({ box: { min: { x: -4, y: 0, z: -4 }, max: { x: 4, y: 6, z: 4 } }, air: (x, y) => y });

  const propGrid = new PropOcclusionGrid(0.16);
  // A vertical pillar standing on the floor from y = 0..4, centered at (0, 2, 0).
  propGrid.addTriangles(makeBoxTriangles(0, 2, 0, 1.0, 4.0, 1.0));

  // Pillar face right near the floor junction (y = 0.08): should have tight seamClearance.
  const pillarBase = propGrid.contactMetrics(0.5, 0.08, 0, 1, 0, 0, { grid, isProp: true });
  // Pillar face well up in open air (y = 2.4): should have high seamClearance.
  const pillarMid = propGrid.contactMetrics(0.5, 2.4, 0, 1, 0, 0, { grid, isProp: true });
  // Floor right next to the pillar foot (x = 0.58, y = 0.02): should detect prop contact.
  const floorAtPillar = propGrid.contactMetrics(0.58, 0.02, 0, 0, 1, 0, { grid, isProp: false });
  // Open floor far from the pillar (x = 3.0, y = 0.02): should be open.
  const floorOpen = propGrid.contactMetrics(3.0, 0.02, 0, 0, 1, 0, { grid, isProp: false });

  assert.ok(pillarBase.seamClearance < 0.35, `pillar base clearance should be tight, got ${pillarBase.seamClearance}`);
  assert.ok(pillarMid.seamClearance > 0.85, `pillar mid-shaft should be open, got ${pillarMid.seamClearance}`);
  assert.ok(floorAtPillar.seamClearance < floorOpen.seamClearance - 0.15,
    `floor beside pillar (${floorAtPillar.seamClearance}) should have tighter seam than open floor (${floorOpen.seamClearance})`);
  assert.equal(propGrid.contactAO(0.5, 0.08, 0, 1, 0, 0, { grid, isProp: true }), pillarBase.ao);
});

test('LightBake packs finite 4-channel bakeShade with seamClearance contrast at junctions', () => {
  assert.equal(SHADE_SIZE, 4);
  const grid = new DensityGrid({ min: { x: -4, y: -2, z: -4 }, max: { x: 4, y: 6, z: 4 }, voxel: 0.5 });
  grid.carve({ box: { min: { x: -4, y: 0, z: -4 }, max: { x: 4, y: 6, z: 4 } }, air: (x, y) => y });

  const propGrid = new PropOcclusionGrid(0.16);
  propGrid.addTriangles(makeBoxTriangles(0, 2, 0, 1.0, 4.0, 1.0));

  const positions = new Float32Array([
    0.5, 0.05, 0.0, // pillar base touching floor
    0.5, 2.60, 0.0, // pillar mid-height in open air
    0.6, 0.02, 0.0, // floor right beside pillar
    3.0, 0.02, 0.0, // open floor
  ]);
  const normals = new Float32Array([
    1, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 1, 0,
  ]);
  const lights = [{ x: 2.5, y: 3.0, z: 1.0, color: [3, 2.5, 2], range: 12, radius: 1.0 }];

  const propBake = bakeLighting({
    grid,
    propGrid,
    propShadows: { isProp: true, contactStrength: 0.72 },
    positions,
    normals,
    lights,
    iceAt: () => 0,
    absorption: { rock: [2.2, 2.2, 2.2], ice: [0.4, 0.12, 0.04] },
  });

  assert.equal(propBake.shade.length, 4 * SHADE_SIZE);
  for (let i = 0; i < propBake.shade.length; i += 1) {
    assert.ok(Number.isFinite(propBake.shade[i]), `bakeShade[${i}] must be finite`);
  }
  const baseClearance = propBake.shade[0 * SHADE_SIZE + 3];
  const midClearance = propBake.shade[1 * SHADE_SIZE + 3];
  assert.ok(baseClearance < midClearance - 0.4,
    `pillar base seamClearance (${baseClearance}) should be much tighter than mid-shaft (${midClearance})`);
});

test('interior seam materials, crystal ice, and waterfall compile cleanly to WGSL', () => {
  const catalog = loadCatalog();
  const geometry = new THREE.BoxGeometry();
  const count = geometry.attributes.position.count;
  for (const [name, size] of [
    ['surfMask', 4], ['surfMask2', 4], ['woodMask', 4],
    ['bakeLight', 3], ['bakeDir', 3], ['bakeShade', SHADE_SIZE], ['tint', 3],
  ]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * size), size));
  }

  // Verify seam profiles exist on key interior archetypes.
  for (const [siteId, matKeys] of [
    ['showcase-deep-workings', ['terrain', 'timber', 'iron']],
    ['showcase-umbrakor-cavern', ['terrain', 'masonry', 'iron', 'timber']],
    ['showcase-stonehold-hall', ['terrain', 'masonry', 'carved', 'iron', 'bronze']],
    ['showcase-frostgard-glacier', ['terrain', 'timber']],
    ['showcase-frostgard-hold', ['terrain', 'masonry', 'timber']],
  ]) {
    const site = catalog.sites.get(siteId);
    assert.ok(site, `missing site ${siteId}`);
    for (const key of matKeys) {
      const entry = site.materials[key];
      assert.ok(entry, `missing material ${siteId}/${key}`);
      if (entry.kind === 'stone') {
        assert.ok(entry.profile.seam && entry.profile.seam.strength > 0,
          `${siteId}/${key} should declare an active seam profile`);
      }
    }
  }

  // Verify indirectBounce & propShadows are active for Umbra'kor and Stonehold.
  for (const siteId of ['showcase-deep-workings', 'showcase-umbrakor-cavern', 'showcase-stonehold-hall']) {
    const site = catalog.sites.get(siteId);
    assert.ok(site.lighting.indirectBounce?.strength > 0, `${siteId} indirectBounce enabled`);
    assert.ok(site.lighting.propShadows?.contactStrength > 0, `${siteId} propShadows enabled`);
  }

  // Compile IceCrystalMaterial (opaque + transmission) & WaterfallMaterial & GlacierIceMaterial.
  const glacierSite = catalog.sites.get('showcase-frostgard-glacier');
  const iceEntry = glacierSite.materials.terrain;
  const iceMaps = { ice: dummyMaps(), cracks: dummyMaps(), snow: dummyMaps(), rock: dummyMaps() };

  const extras = [
    createGlacierIceMaterial('test-glacier-seam', {
      profile: iceEntry.profile, maps: iceMaps, stoneProfile: iceEntry.bedrock, masked: true,
    }),
    createIceCrystalMaterial('test-crystal-opaque', {
      profile: iceEntry.profile, maps: iceMaps, transmission: false,
    }),
    createWaterfallMaterial('test-waterfall', { noiseMap: new THREE.Texture() }),
    createStoneMaterial('test-stonehold-terrain', catalog.sites.get('showcase-stonehold-hall').materials.terrain.profile, {
      ...dummyMaps(), floor: dummyMaps(),
    }, { masked: true }),
  ];

  for (const material of extras) {
    const { fragmentShader } = buildShader(new THREE.Mesh(geometry, material));
    assert.ok(fragmentShader.length > 200, `${material.name} compiled WGSL`);
    const textures = fragmentShader.match(/: texture_2d(_array)?</g) ?? [];
    assert.ok(textures.length <= 16, `${material.name} texture budget (${textures.length} <= 16)`);
    material.dispose();
  }
  geometry.dispose();
});

test('Umbra\'kor, Stonehold, and Glacier classifiers feather surface transitions smoothly', () => {
  const catalog = resolveLocationCatalog(
    yaml.load(fs.readFileSync(new URL('../config/instanced-locations.yaml', import.meta.url), 'utf8')),
    { generatorKeys: Object.keys(LOCATION_GENERATORS), quality: 'low' },
  );

  // 1. Umbra'kor: dressed plaza <-> raw basalt cliff transition produces intermediate mask[3] values.
  const umbraSite = catalog.sites.get('showcase-umbrakor-cavern');
  const umbraBuilder = generateLocation(umbraSite, LOCATION_GENERATORS[umbraSite.generatorKey]);
  const mask = [0, 0, 0, 0], mask2 = [0, 0, 0, 0];
  let umbraMid = 0;
  for (let ny = 0.45; ny <= 0.95; ny += 0.04) {
    const nz = Math.sqrt(Math.max(0, 1 - ny * ny));
    for (let z = -22; z <= -4; z += 4) {
      umbraBuilder.classify({ x: 0, y: 16.0, z }, { x: 0, y: ny, z: nz }, mask, mask2);
      if (mask[3] > 0.08 && mask[3] < 0.92) umbraMid += 1;
    }
  }
  assert.ok(umbraMid > 5, `Umbra'kor dressed/cliff mask should have smooth intermediate transitions (got ${umbraMid})`);

  // 2. Stonehold: chasm rock <-> hall dressed floor transition produces intermediate mask[3] values.
  const stoneSite = catalog.sites.get('showcase-stonehold-hall');
  const stoneBuilder = generateLocation(stoneSite, LOCATION_GENERATORS[stoneSite.generatorKey]);
  let stoneMid = 0;
  for (let y = -2.5; y <= 0.5; y += 0.08) {
    for (let z = -55; z <= -35; z += 5) {
      stoneBuilder.classify({ x: 2, y, z }, { x: 0, y: 1, z: 0 }, mask, mask2);
      if (mask[3] > 0.08 && mask[3] < 0.92) stoneMid += 1;
    }
  }
  assert.ok(stoneMid > 5, `Stonehold chasm/floor mask should have smooth intermediate transitions (got ${stoneMid})`);

  // 3. Glacier refuge: refuge bedrock knob <-> glacier ice ceiling transition produces intermediate mask[0] values.
  const glacierSite = catalog.sites.get('showcase-frostgard-refuge');
  const glacierBuilder = generateLocation(glacierSite, LOCATION_GENERATORS[glacierSite.generatorKey]);
  let glacierMid = 0;
  for (let y = -1.0; y <= 5.0; y += 0.12) {
    glacierBuilder.classify({ x: -38, y, z: -72 }, { x: 0, y: 0.5, z: 0.86 }, mask, mask2);
    if (mask[0] > 0.08 && mask[0] < 0.92) glacierMid += 1;
  }
  assert.ok(glacierMid > 3, `Glacier refuge bedrock/ice mask should have smooth intermediate transitions (got ${glacierMid})`);
});
