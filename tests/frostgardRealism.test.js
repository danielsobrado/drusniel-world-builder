import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { createAlpineMountainBackdrop } from '../src/editor/locations/AlpineMountainBackdrop.js';
import { collarRing, drapedHideMesh, hewnPole, windFlagMesh } from '../src/editor/locations/gen/clothKit.js';
import { boulder, roofSnowBlanket, snowPillow } from '../src/editor/locations/gen/iceKit.js';
import { buildLocationAlpineUnderstory } from '../src/editor/locations/generators/LocationAlpineUnderstory.js';
import { createLocationClothMaterial } from '../src/editor/locations/materials/LocationClothMaterial.js';

const MOCK_SKY = {
  zenith: '#3b6490',
  horizon: '#b8d1e8',
  ground: '#c8d6e3',
  sun: { direction: [0.45, 0.35, -0.82], color: '#ffe8c6', disc: 1, glow: 0.4, halo: 0.15 },
  peaks: { radius: 900, height: 220, seed: 42, rock: '#4c5462', snow: '#f0f5fa', shade: '#8ba4c4', haze: 0.32 },
};

test('createAlpineMountainBackdrop generates 3 depth-layered 3D massif rings with finite normals', () => {
  const group = createAlpineMountainBackdrop(MOCK_SKY, null);
  assert.equal(group.children.length, 3, 'should create 3 depth-ordered mountain range rings');
  const orders = group.children.map((m) => m.renderOrder);
  assert.ok(orders[0] < orders[1] && orders[1] < orders[2], 'rings should draw back-to-front');

  for (const mesh of group.children) {
    const pos = mesh.geometry.attributes.position;
    const norm = mesh.geometry.attributes.normal;
    const attr = mesh.geometry.attributes.mtnAttr;
    assert.ok(pos.count > 4000, `ring ${mesh.name} should be high-resolution 3D mesh`);
    assert.equal(norm.count, pos.count);
    assert.equal(attr.count, pos.count);
    for (let i = 0; i < pos.count; i += 29) {
      const len = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
      assert.ok(Number.isFinite(len) && len > 0.9 && len < 1.1, 'vertex normals must be unit length');
    }
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test('boulder and snowPillow emit smooth welded high-detail alpine geometry with cavity tint', () => {
  const erratic = boulder({ x: 0, y: 0, z: 0 }, 2.2, 1.6, 2.0, { seed: 77, blocky: 0.26 });
  const triCount = erratic.index ? erratic.index.count / 3 : erratic.attributes.position.count / 3;
  assert.ok(triCount >= 700, `foreground erratic should use high subdivision (got ${triCount} tris)`);
  assert.ok(erratic.attributes.tint, 'boulder should carry baked cavity occlusion tint');
  assert.ok(erratic.attributes.normal, 'boulder should have computed vertex normals');
  erratic.dispose();

  const pillow = snowPillow({ x: 0, y: 0, z: 0 }, 1.2, 0.3, 0.9, { seed: 13, drape: 0.25 });
  assert.ok(pillow.attributes.position.count > 150, 'snowPillow should be smoothly subdivided');
  pillow.dispose();

  const blanket = roofSnowBlanket({ x: 0, y: 2.2, z: 0 }, 4.0, 1.8, 0.42, { seed: 41 });
  assert.ok(blanket.attributes.position.count > 150, 'roofSnowBlanket should be a continuous contoured mesh');
  blanket.dispose();
});

test('clothKit flags, hides, poles, and collars produce valid GPU wind attributes', () => {
  const flag = windFlagMesh({ x: 0, y: 2.2, z: 0 }, { x: 0, y: 1.8, z: 0 }, { x: 0.6, y: 0, z: 0.8 }, 0.95, { seed: 7 });
  const clothData = flag.attributes.clothData;
  const uv = flag.attributes.uv;
  assert.ok(clothData && uv, 'flag must emit clothData and uv attributes');
  let pinnedZero = 0;
  let maxPin = 0;
  for (let i = 0; i < clothData.count; i += 1) {
    const pin = clothData.getX(i);
    if (pin === 0) pinnedZero += 1;
    if (pin > maxPin) maxPin = pin;
  }
  assert.ok(pinnedZero >= 9, 'entire hoist edge must stay pinned at 0');
  assert.ok(maxPin > 0.95, 'fly edge must reach full wind freedom');
  flag.dispose();

  const hide = drapedHideMesh({ x: 0, y: 1.75, z: 0 }, { x: 0.85, y: 1.75, z: 0 }, 1.05, { seed: 11 });
  assert.ok(hide.attributes.clothData && hide.attributes.tint, 'draped hide must carry clothData and fur tint');
  hide.dispose();

  const pole = hewnPole({ x: 0, y: 0, z: 0 }, { x: 0.05, y: 2.4, z: 0 }, 0.06, 0.04, { seed: 5 });
  assert.ok(pole.attributes.position.count > 40);
  pole.dispose();

  const ring = collarRing({ x: 0, y: 2.0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.05, 0.04);
  assert.ok(ring.attributes.position.count > 20);
  ring.dispose();
});

test('createLocationClothMaterial configures DoubleSide GPU vertex wind shader', () => {
  const wool = createLocationClothMaterial('test-wool', {
    tint: '#c83728',
    roughness: 0.9,
    cloth: { style: 'wool', windAmp: 0.13, windSpeed: 5.4 },
  });
  assert.equal(wool.side, THREE.DoubleSide);
  assert.ok(wool.positionNode, 'cloth material must bind GPU vertex wind positionNode');
  wool.dispose();

  const pelt = createLocationClothMaterial('test-pelt', {
    tint: '#948777',
    roughness: 0.93,
    cloth: { style: 'pelt', windAmp: 0.04, windSpeed: 2.2 },
  });
  assert.equal(pelt.side, THREE.DoubleSide);
  assert.ok(pelt.positionNode);
  pelt.dispose();
});

test('buildLocationAlpineUnderstory respects trail clearances and stays readback-free', () => {
  const count = 800;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const light = new Float32Array(count * 3);
  const dir = new Float32Array(count * 3);
  const shade = new Float32Array(count * 4);
  const mask = new Float32Array(count * 4);
  const mask2 = new Float32Array(count * 4);

  for (let i = 0; i < count; i += 1) {
    const x = -30 + (i % 40) * 1.5;
    const z = -15 + Math.floor(i / 40) * 2.2;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 1.2;
    positions[i * 3 + 2] = z;
    normals[i * 3 + 1] = 1;
    light[i * 3] = 0.8; light[i * 3 + 1] = 0.85; light[i * 3 + 2] = 0.9;
    dir[i * 3 + 1] = 1;
    shade[i * 4] = 0.9; shade[i * 4 + 1] = 0.4; shade[i * 4 + 2] = 0.9; shade[i * 4 + 3] = 1;
    // Half rock/moraine, half ice/melt channel; center strip marked as trail.
    mask[i * 4] = i % 2 === 0 ? 0.85 : 0.1;
    mask[i * 4 + 1] = -0.25;
    mask2[i * 4 + 2] = i % 2 === 1 ? 0.6 : 0;
    mask2[i * 4 + 3] = Math.abs(x) < 3 ? 0.9 : 0;
  }

  const dummyMat = new THREE.MeshBasicNodeMaterial();
  const meshes = buildLocationAlpineUnderstory({
    surface: { positions, normals },
    baked: { light, dir, shade },
    mask,
    mask2,
    nav: null,
    rockMaterial: dummyMat,
    crystalMaterial: dummyMat,
    maxCobbles: 60,
    maxIceShards: 40,
    maxTundraSedge: 30,
    maxTundraLichen: 30,
  });

  assert.equal(meshes.length, 4, 'should create all 4 GPU-instanced alpine understory layers');
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  for (const mesh of meshes) {
    assert.ok(mesh.isInstancedMesh && mesh.count > 0);
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, mat);
      pos.setFromMatrixPosition(mat);
      assert.ok(Math.abs(pos.x) >= 2.9, `${mesh.name} instance must stay off trail (got x=${pos.x})`);
    }
    mesh.geometry.dispose();
    if (mesh.material !== dummyMat) mesh.material.dispose();
  }
  dummyMat.dispose();

  // Verify zero blocking GPU readbacks in new runtime modules.
  for (const file of [
    'src/editor/locations/AlpineMountainBackdrop.js',
    'src/editor/locations/materials/LocationClothMaterial.js',
    'src/editor/locations/generators/LocationAlpineUnderstory.js',
    'src/editor/locations/gen/clothKit.js',
  ]) {
    const src = fs.readFileSync(file, 'utf8');
    assert.equal(/\bmapAsync\b|\breadRenderTargetPixels\b/.test(src), false, `${file} must not block on GPU readback`);
  }
});
