import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { GroundContactField, buildBiomeSoilPalette } from '../src/editor/stylized/groundContact/GroundContactField.js';
import {
  GROUND_CONTACT_RESOLUTION,
  GROUND_CONTACT_SPAN_M,
  clearGroundContactField,
  groundContactEcoTexture,
  groundContactGeoTexture,
  groundContactSoilTexture,
  groundContactUniforms,
} from '../src/editor/stylized/groundContact/GroundContactState.js';
import { contactShadeRadius, paintContactShade, resolveContactShade } from '../src/editor/stylized/contactShade.js';
import { buildChunkContactShadeKey, collectChunkContactShadeSources } from '../src/editor/stylized/groundContact/contactShadeSources.js';
import { fitRockToGround } from '../src/editor/stylized/rockGroundFit.js';
import { createMeadowGroundSample } from '../src/editor/stylized/meadow/MeadowGroundSample.js';
import { createMeadowBladeMaterial } from '../src/editor/stylized/meadow/meadowBladeMaterial.js';
import { createMeadowUniforms } from '../src/editor/stylized/meadow/meadowUniforms.js';
import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { GrassTuning } from '../src/editor/stylized/GrassTuning.js';
import { applyRockWeathering, resolveRockWeathering } from '../src/editor/stylized/rockWeathering.js';
import { bakeSnowNormal } from '../src/editor/stylized/snowDeposition.js';
import { createAlpineRockMaterial } from '../src/editor/stylized/alpine/AlpineRockMaterial.js';
import { cloneBushMaterial, createBushProxyPrototype } from '../src/editor/stylized/BushRenderAssets.js';
import { createDitheredMaterial } from '../src/editor/stylized/lod/StylizedDitheredMaterial.js';
import { buildShader } from './helpers/buildShader.js';

const rootConfig = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));
const config = rootConfig.stylizedSurface;

function makeSlopedSlot({ chunkX, chunkZ, chunkSize = 16, tileSize = 2, slopeX = 0.25, slopeZ = -0.1, tileId = 6 }) {
  const originCellX = chunkX * chunkSize;
  const originCellZ = chunkZ * chunkSize;
  const centerWorldX = (originCellX + chunkSize * 0.5) * tileSize;
  const centerWorldZ = -(originCellZ + chunkSize * 0.5) * tileSize;
  const vSize = chunkSize + 1;
  const heights = new Float32Array(vSize * vSize);
  for (let lz = 0; lz < vSize; lz += 1) {
    const worldZ = -(originCellZ + lz) * tileSize;
    for (let lx = 0; lx < vSize; lx += 1) {
      const worldX = (originCellX + lx) * tileSize;
      heights[lz * vSize + lx] = 10 + worldX * slopeX + worldZ * slopeZ;
    }
  }
  const tiles = new Uint8Array(chunkSize * chunkSize).fill(tileId);
  const forestFloorSize = 32;
  const forestFloorPixels = new Uint8Array(forestFloorSize * forestFloorSize * 4);
  for (let i = 0; i < forestFloorSize * forestFloorSize; i += 1) {
    forestFloorPixels[i * 4] = 128; // canopy
    forestFloorPixels[i * 4 + 1] = 204; // contactShade ~0.8
    forestFloorPixels[i * 4 + 2] = 64; // litter
    forestFloorPixels[i * 4 + 3] = 255;
  }
  return {
    descriptor: {
      key: `${chunkX}:${chunkZ}`,
      chunkX,
      chunkZ,
      originCellX,
      originCellZ,
      centerWorldX,
      centerWorldZ,
    },
    page: { heights, tiles },
    pageRevision: 1,
    loading: false,
    forestFloorPixels,
    forestFloorSize,
    forestFloorKey: 'v1',
  };
}

test('GroundContactField packs exact sloped height, terrain normal, contact AO, and biome soil with zero readbacks', () => {
  clearGroundContactField();
  const chunkSize = 16;
  const tileSize = 2;
  const slots = [];
  for (let cz = -2; cz <= 1; cz += 1) {
    for (let cx = -2; cx <= 1; cx += 1) {
      slots.push(makeSlopedSlot({ chunkX: cx, chunkZ: cz, chunkSize, tileSize, slopeX: 0.25, slopeZ: -0.1, tileId: 6 }));
    }
  }
  const terrainView = { slots, worldStore: { chunkSize, tileSize } };
  const field = new GroundContactField({ terrainView, config, resolution: GROUND_CONTACT_RESOLUTION, span: GROUND_CONTACT_SPAN_M });
  try {
    assert.equal(field.update({ x: 0, z: 0 }, { x: 100, z: -200 }), true);
    assert.equal(groundContactUniforms.active.value, 1);
    assert.equal(groundContactUniforms.renderOrigin.value.x, groundContactUniforms.canonicalOrigin.value.x - 100);
    assert.equal(groundContactUniforms.renderOrigin.value.y, groundContactUniforms.canonicalOrigin.value.y + 200);

    // Inspect centre texel: (64, 64) sits at worldX = 0.5, worldZ = 0.5.
    const idx = (64 * GROUND_CONTACT_RESOLUTION + 64) * 4;
    const nx = THREE.DataUtils.fromHalfFloat(groundContactGeoTexture.image.data[idx + 1]);
    const nz = THREE.DataUtils.fromHalfFloat(groundContactGeoTexture.image.data[idx + 2]);
    const validity = THREE.DataUtils.fromHalfFloat(groundContactGeoTexture.image.data[idx + 3]);
    const contact = groundContactEcoTexture.image.data[idx] / 255;
    const expectedLen = Math.hypot(-0.25, 1, 0.1);
    assert.ok(Math.abs(nx - (-0.25 / expectedLen)) < 0.015, `nx ${nx} vs ${-0.25 / expectedLen}`);
    assert.ok(Math.abs(nz - (0.1 / expectedLen)) < 0.015, `nz ${nz} vs ${0.1 / expectedLen}`);
    assert.ok(Math.abs(contact - 0.8) < 0.02, `contact ${contact} vs 0.8`);
    assert.equal(validity, 1);

    // Floating-origin shift moves only renderOrigin without rebuilding textures.
    const prevVersion = groundContactGeoTexture.version;
    field.update({ x: 2, z: -2 }, { x: 500, z: 300 });
    assert.equal(groundContactGeoTexture.version, prevVersion);
    assert.equal(groundContactUniforms.renderOrigin.value.x, groundContactUniforms.canonicalOrigin.value.x - 500);

    // Biome soil palette produces distinct linear soil values across desert vs wetland.
    const palette = buildBiomeSoilPalette(config);
    assert.ok(palette[1 * 3] > 0 && palette[12 * 3] > 0);
    assert.notEqual(Math.round(palette[1 * 3] * 1000), Math.round(palette[12 * 3] * 1000));
    assert.equal(groundContactEcoTexture.image.data[idx + 1], 128, 'canopy shade packed in ecology green');
    assert.equal(groundContactSoilTexture.image.data[idx + 3], 230, 'roughness packed in surface alpha');
  } finally {
    field.dispose();
    assert.equal(groundContactUniforms.active.value, 0);
  }
});

test('contactShade paints oriented ellipses and collects bushes and neighbour-chunk overlaps across borders', () => {
  const settings = resolveContactShade(config);
  assert.ok(contactShadeRadius(settings, 'bush', 1) > 0);

  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  paintContactShade({
    pixels,
    size,
    centerWorldX: 0,
    centerWorldZ: 0,
    chunkWorldSize: 64,
    sources: [{ x: 0, z: 0, radius: 8, radiusX: 8, radiusZ: 2.5, rotationY: 0, strength: 1 }],
    channel: 1,
  });
  const alongX = pixels[(32 * size + 37) * 4 + 1];
  const alongZ = pixels[(37 * size + 32) * 4 + 1];
  assert.ok(alongX > alongZ * 2, `elliptical contact should extend further along X (${alongX}) than Z (${alongZ})`);

  // Neighbour chunk tree right outside border (+65 m) overlaps chunk [0..64] via its 4.2 m radius.
  const descriptor = { chunkX: 0, chunkZ: 0, centerWorldX: 32, centerWorldZ: -32 };
  const treeMap = new Map([
    ['0:0', []],
    ['1:0', [{ x: 65, z: -32, scale: 1 }]],
  ]);
  const bushMap = new Map([
    ['0:0', { placements: [{ x: 20, z: -20, scale: 1.2 }] }],
  ]);
  const { sources } = collectChunkContactShadeSources({
    descriptor,
    chunkWorldSize: 64,
    settings,
    treeView: { manifestStore: { get: (x, z) => treeMap.get(`${x}:${z}`) ?? [], peek: (x, z) => treeMap.get(`${x}:${z}`) ?? [] } },
    rockView: { getPlacements: () => [] },
    bushView: { manifestCache: bushMap },
    forestDebrisView: null,
    alpineRockView: null,
  });
  assert.equal(sources.length, 2, 'should include both own bush and overlapping neighbour-chunk tree');
  const key = buildChunkContactShadeKey({
    descriptor,
    treeView: { manifestStore: { get: (x, z) => treeMap.get(`${x}:${z}`) ?? [], peek: (x, z) => treeMap.get(`${x}:${z}`) ?? [] } },
    rockView: { placementsByChunk: new Map() },
    bushView: { manifestCache: bushMap },
    forestDebrisView: null,
    alpineRockView: null,
  });
  assert.equal(key, '1:0:1:0:0');
});

test('fitRockToGround seats boulders toward downhill support with a clamped partial slope tilt', () => {
  const slope = 0.5;
  const fit = fitRockToGround({ x: 10, z: -5, scale: 1 }, 2, (x) => x * slope);
  assert.ok(fit && fit.groundNormal);
  assert.ok(fit.groundFitHeight < 10 * slope, 'sinks toward downhill support');
  assert.ok(fit.groundNormal[0] < -0.1 && fit.groundNormal[1] > 0.9, 'tilts gently into slope without toppling');
});

test('MeadowGroundSample parts collar tufts around rocks and thins grass inside woody bush cores', () => {
  const chunkSize = 16;
  const tileSize = 2;
  const vSize = chunkSize + 1;
  const page = {
    tiles: new Uint8Array(chunkSize * chunkSize).fill(4),
    heights: new Float32Array(vSize * vSize),
    surfaceMaskPixels: null,
  };
  const eligible = new Uint8Array(256);
  eligible[4] = 1;
  const shapeTable = new Uint8Array(256);
  const descriptor = { originCellX: 0, originCellZ: 0, centerWorldX: 16, centerWorldZ: -16 };
  const sample = createMeadowGroundSample({
    page,
    descriptor,
    chunkSize,
    tileSize,
    eligible,
    shapeTable,
    growth: null,
    worldSeed: 1,
    rocks: [{ x: 10, z: -10, radius: 1.0, reach: 2.2 }],
    flatten: 0.4,
    roots: [{ kind: 'bush', x: 20, z: -20, radius: 1.2, reach: 1.9 }],
    pathConfig: null,
    forest: null,
  });

  const out = { height: 0, strength: 0, shape: 0, path: 0, rotSin: NaN, rotCos: NaN };
  // Inside rock core -> rejected.
  assert.equal(sample(10.2, -10, 1, out), false);
  // In rock collar (+X side) -> accepted and parted outward (+X).
  assert.equal(sample(11.2, -10, 2, out), true);
  assert.ok(Math.abs(out.rotSin - (-1)) < 1e-4 && Math.abs(out.rotCos) < 1e-4);
  // Deep inside bush core -> rejected.
  assert.equal(sample(20.1, -20, 3, out), false);
});

test('updated blade, rock, alpine rock, and bush ground-contact shaders compile cleanly to WGSL', () => {
  // 1. Meadow blades (vertex textureLoad, zero extra samplers).
  const meadowSettings = resolveMeadowGrassConfig(config.grass.meadow);
  const uniforms = createMeadowUniforms(meadowSettings);
  const tuning = new GrassTuning(config);
  const bladeMat = createMeadowBladeMaterial({
    uniforms,
    tuning: tuning.uniforms,
    config,
    sunDirection: uniform(new THREE.Vector3(0.4, 0.8, 0.3)),
    bandCount: 3,
    handoff: true,
    tileSize: meadowSettings.tileSize,
  });
  const template = createMeadowTemplate({ detail: 3, count: 4, tileSize: 8, lodDetails: [2, 1], lodIndex: 0 });
  const bladeGeo = new THREE.InstancedBufferGeometry();
  for (const name of ['position', 'uv', 'bladeProfile', 'instancePosition', 'instanceRotation', 'instanceData']) {
    bladeGeo.setAttribute(name, template.getAttribute(name));
  }
  bladeGeo.setAttribute('instanceTile', new THREE.InstancedBufferAttribute(new Float32Array(16), 4));
  bladeGeo.index = template.index;
  bladeGeo.instanceCount = 4;
  const bladeShader = buildShader(new THREE.Mesh(bladeGeo, bladeMat));
  assert.ok(bladeShader.vertexShader.includes('textureLoad') && bladeShader.fragmentShader.length > 0);

  // 2. Authored rock weathering with ground-contact soil + snow skirt.
  const rockGeo = bakeSnowNormal(new THREE.IcosahedronGeometry(1, 1));
  for (const [name, vals] of Object.entries({
    instanceDither: [1, 0.5, 1],
    instanceSurface: [0, 0, 0],
    instanceBiomeLook: [1, 1, 1, 1],
  })) {
    rockGeo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(vals), vals.length));
  }
  const rockMat = applyRockWeathering(new THREE.MeshStandardNodeMaterial(), {
    settings: resolveRockWeathering(config.rocks.weathering),
    seaLevel: 0,
    localWater: true,
    biomeLook: true,
    ground: { smoothNormal: true, groundY: -0.7, height: 1.7, centre: [0, 0, 0] },
  });
  const rockShader = buildShader(new THREE.InstancedMesh(rockGeo, rockMat, 1));
  assert.ok(rockShader.vertexShader.includes('textureLoad') && rockShader.fragmentShader.length > 0);

  // 3. Alpine rock material with scree + ground-relative snow skirt.
  const alpineGeo = new THREE.IcosahedronGeometry(1, 1);
  alpineGeo.setAttribute('instanceSnow', new THREE.InstancedBufferAttribute(new Float32Array([0.3]), 1));
  const alpineShader = buildShader(new THREE.InstancedMesh(alpineGeo, createAlpineRockMaterial(), 1));
  assert.ok(alpineShader.vertexShader.includes('textureLoad') && alpineShader.fragmentShader.length > 0);

  // 4. Bush near + proxy materials with shader ground-conform + base AO.
  const bushGeo = new THREE.BoxGeometry(1, 1, 1);
  bushGeo.translate(0, 0.5, 0);
  bushGeo.computeBoundingBox();
  for (const [name, vals] of Object.entries({
    instanceDither: [1, 0.4, 1],
    instanceBiomeLook: [1, 1, 1, 1],
    instancePlantRoot: [0, 0, 0],
  })) {
    bushGeo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(vals), vals.length));
  }
  const nearBushMat = cloneBushMaterial(new THREE.MeshStandardMaterial({ color: '#4d6f3b' }), {
    config,
    height: 1,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    tileId: 6,
    biomeLook: true,
  });
  assert.equal(nearBushMat.userData.plantMotionAnchor, true, 'bush enables shader ground conform root anchor');
  const nearBushShader = buildShader(new THREE.InstancedMesh(bushGeo, createDitheredMaterial(nearBushMat), 1));
  assert.ok(nearBushShader.vertexShader.includes('textureLoad') && nearBushShader.fragmentShader.length > 0);

  const proxy = createBushProxyPrototype({ geometry: bushGeo, material: nearBushMat, height: 1, prototypeId: 'test-bush' }, {
    config,
    tileId: 6,
    biomeLook: true,
  });
  for (const [name, vals] of Object.entries({
    instanceDither: [1, 0.4, 1],
    instanceBiomeLook: [1, 1, 1, 1],
    instancePlantRoot: [0, 0, 0],
  })) {
    proxy.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(vals), vals.length));
  }
  const proxyBushShader = buildShader(new THREE.InstancedMesh(proxy.geometry, createDitheredMaterial(proxy.material), 1));
  assert.ok(proxyBushShader.vertexShader.includes('textureLoad') && proxyBushShader.fragmentShader.length > 0);
});
