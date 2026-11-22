import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { hangingBannerMesh } from '../src/editor/locations/gen/clothKit.js';
import { buildLocationAlpineUnderstory } from '../src/editor/locations/generators/LocationAlpineUnderstory.js';
import { LOCATION_GENERATORS } from '../src/editor/locations/generators/index.js';
import { createWaterfallSheet } from '../src/editor/locations/generators/stoneholdDressing.js';
import { generateLocation } from '../src/editor/locations/LocationBuilder.js';
import { resolveLocationCatalog } from '../src/editor/locations/LocationCatalog.js';
import { createWaterfallMaterial } from '../src/editor/locations/materials/WaterfallMaterial.js';

test('hangingBannerMesh produces pleated vertical cloth with pinned top bar and baked heraldry', () => {
  const geo = hangingBannerMesh({ x: -0.9, y: 5, z: 0 }, { x: 0.9, y: 5, z: 0 }, 4.6, { seed: 42, flutter: 0.2 });
  const clothData = geo.attributes.clothData;
  const tint = geo.attributes.tint;
  assert.ok(clothData && tint && geo.attributes.uv, 'banner must emit clothData, tint, and uv');
  let pinned = 0;
  let maxPin = 0;
  for (let i = 0; i < clothData.count; i += 1) {
    const p = clothData.getX(i);
    if (p === 0) pinned += 1;
    if (p > maxPin) maxPin = p;
  }
  assert.ok(pinned >= 15, 'entire top crossbar edge must stay pinned at 0');
  assert.ok(maxPin > 0.8, 'lower banner tip must allow gentle draft sway');
  geo.dispose();
});

test('createWaterfallSheet builds a 3D multi-column volumetric sheet and WaterfallMaterial animates vertices', () => {
  const sheet = createWaterfallSheet({ x: 0, y: 20, z: -14 }, { x: 0, y: -10, z: -6 }, { widthTop: 3.4, widthBot: 5.2, bow: 2.4 });
  assert.ok(sheet.attributes.position.count >= 220, 'waterfall sheet should be subdivided across both width and height');
  assert.ok(sheet.attributes.normal && sheet.attributes.uv);
  sheet.dispose();

  const dummyTex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  const mat = createWaterfallMaterial('test-waterfall', { noiseMap: dummyTex });
  assert.ok(mat.positionNode, 'waterfall material should bind GPU vertex turbulence positionNode');
  mat.dispose();
  dummyTex.dispose();

  const wfSrc = fs.readFileSync('src/editor/locations/materials/WaterfallMaterial.js', 'utf8');
  assert.equal(/\bmapAsync\b|\breadRenderTargetPixels\b/.test(wfSrc), false);
});

test('Stonehold catalog resolves coursed alpine masonry, pine, waterfall, and alpine understory budgets', () => {
  const doc = yaml.load(fs.readFileSync('config/instanced-locations.yaml', 'utf8'));
  const catalog = resolveLocationCatalog(doc, { generatorKeys: Object.keys(LOCATION_GENERATORS), quality: 'high' });
  const gate = catalog.site('showcase-stonehold-gate');
  assert.ok(gate.materials.carved.profile.masonry, 'stonehold_alpine_carved must define coursed ashlar masonry');
  assert.ok(gate.materials.masonry.profile.masonry, 'stonehold_alpine_masonry must define cyclopean masonry');
  assert.ok(gate.params.alpineUnderstory?.cobbles > 0, 'gate approach must define alpine understory budget');

  const gateBuilder = generateLocation(gate, LOCATION_GENERATORS[gate.generatorKey]);
  assert.ok(gateBuilder.props.get('cloth')?.length >= 6);
  assert.ok(gateBuilder.props.get('waterfall')?.length >= 4);
  assert.ok(gateBuilder.props.get('clearIce')?.length >= 6);

  const throne = catalog.site('showcase-stonehold-throne');
  const throneBuilder = generateLocation(throne, LOCATION_GENERATORS[throne.generatorKey]);
  assert.ok(throneBuilder.props.get('cloth')?.length >= 10, 'throne hall should emit draped banners and royal carpet');
  assert.ok(throneBuilder.props.get('gold')?.length >= 20, 'throne hall should emit sculpted gold hoards');
});

test('buildLocationAlpineUnderstory supports isStoneTerrain and skips dressed plazas', () => {
  const count = 400;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const light = new Float32Array(count * 3);
  const dir = new Float32Array(count * 3);
  const shade = new Float32Array(count * 4);
  const mask = new Float32Array(count * 4);

  for (let i = 0; i < count; i += 1) {
    const x = -25 + (i % 20) * 2.5;
    const z = -10 + Math.floor(i / 20) * 2.5;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 8.0;
    positions[i * 3 + 2] = z;
    normals[i * 3 + 1] = 1;
    light[i * 3] = 0.7; light[i * 3 + 1] = 0.75; light[i * 3 + 2] = 0.8;
    dir[i * 3 + 1] = 1;
    shade[i * 4] = 0.9; shade[i * 4 + 1] = 0.4; shade[i * 4 + 2] = 0.9; shade[i * 4 + 3] = 1;
    mask[i * 4 + 3] = Math.abs(x) < 6 ? 1 : 0; // dressed road in center
  }

  const dummyMat = new THREE.MeshBasicNodeMaterial();
  const meshes = buildLocationAlpineUnderstory({
    surface: { positions, normals },
    baked: { light, dir, shade },
    mask,
    mask2: null,
    nav: null,
    isStoneTerrain: true,
    rockMaterial: dummyMat,
    crystalMaterial: null,
    maxCobbles: 40,
    maxIceShards: 0,
    maxTundraSedge: 25,
    maxTundraLichen: 25,
  });

  assert.equal(meshes.length, 3, 'stone alpine approach should emit cobbles, sedge, and lichen');
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, mat);
      pos.setFromMatrixPosition(mat);
      assert.ok(Math.abs(pos.x) >= 5.5, `${mesh.name} must stay off dressed stone road`);
    }
    mesh.geometry.dispose();
    if (mesh.material !== dummyMat) mesh.material.dispose();
  }
  dummyMat.dispose();
});
