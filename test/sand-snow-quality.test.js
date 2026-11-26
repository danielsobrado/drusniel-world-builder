import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three/webgpu';
import { float, uniform, uv, vec2, vec3 } from 'three/tsl';
import { buildSandDetailPackPixels, blendHeightChannels } from '../scripts/lib/sand-pack-math.mjs';
import { acquireSandDetailMaps } from '../src/editor/assets/godsEnd/sandDetailMaps.js';
import { createAridSubstrateNodes } from '../src/editor/materials/AridSubstrateNodes.js';
import { createCoastSandNodes } from '../src/editor/stylized/CoastSandShading.js';
import { createCoastPatternOrigins } from '../src/editor/stylized/CoastSwashShading.js';
import { createTerrainTransitionPatterns } from '../src/editor/materials/TerrainTransitionNodes.js';
import { createSnowDetailNodes } from '../src/editor/stylized/SnowDetailShading.js';
import { createSnowSurfaceNodes } from '../src/editor/stylized/SnowSurfaceShading.js';
import { applySnowLighting } from '../src/editor/stylized/SnowLightingModel.js';

test('sand detail packer builds seamless tangent normals and preserves wave/grain channels', () => {
  const size = 16;
  const flat = new Float32Array(size * size).fill(0.5);
  const flatPixels = buildSandDetailPackPixels({ size, grain: flat, ripple: flat, broad: flat });
  assert.equal(flatPixels.length, size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    assert.ok(Math.abs(flatPixels[i * 4] - 128) <= 1, 'flat surface has neutral X normal');
    assert.ok(Math.abs(flatPixels[i * 4 + 1] - 128) <= 1, 'flat surface has neutral Y normal');
  }

  // Periodic ramp along X must produce non-neutral X normal and neutral Y normal.
  const wave = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      wave[y * size + x] = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2);
    }
  }
  const sloped = buildSandDetailPackPixels({ size, grain: flat, ripple: wave, broad: flat });
  const crestRightSlope = sloped[0]; // at x=0, sin rises with x -> nx < 0 -> R < 128
  assert.ok(crestRightSlope < 120, `expected tilted X normal, got ${crestRightSlope}`);
  assert.ok(Math.abs(sloped[1] - 128) <= 1, 'pure X wave keeps Y normal neutral');

  const blended = blendHeightChannels(wave, flat, 0.25);
  assert.equal(blended.length, size * size);
  assert.ok(Math.min(...blended) <= 0.001 && Math.max(...blended) >= 0.999);
});

test('packed sand and snow detail textures exist on disk', () => {
  for (const rel of [
    '../public/assets/textures/sand/sand-detail-pack.png',
    '../public/assets/textures/snow/snow-drift-pack.png',
    '../public/assets/textures/snow/snow-grain-rnm.png',
  ]) {
    const stat = fs.statSync(new URL(rel, import.meta.url));
    assert.ok(stat.size > 10000, `${rel} should be a populated 512px packed texture`);
  }
});

test('acquireSandDetailMaps stays lazy in Node and refcounts sampler-free maps with an injected loader', () => {
  assert.equal(acquireSandDetailMaps(), null);
  let loads = 0;
  let disposes = 0;
  const loader = {
    load(url, onLoad) {
      loads += 1;
      assert.match(url, /assets\/textures\/sand\/sand-detail-pack\.png$/);
      const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
      const origDispose = tex.dispose.bind(tex);
      tex.dispose = () => { disposes += 1; origDispose(); };
      onLoad?.(tex);
      return tex;
    },
  };
  const a = acquireSandDetailMaps({ loader });
  const b = acquireSandDetailMaps({ loader });
  assert.equal(loads, 1);
  assert.equal(a.ready.value, 1);
  assert.equal(a.detail.minFilter, THREE.NearestFilter);
  assert.equal(a.detail.magFilter, THREE.NearestFilter);
  a.release();
  assert.equal(disposes, 0);
  b.release();
  assert.equal(disposes, 1);
});

test('upgraded desert sand, coastal sand, and snow TSL graphs assemble cleanly', () => {
  const material = new THREE.MeshStandardNodeMaterial();
  const patterns = createTerrainTransitionPatterns();
  const coastPatterns = createCoastPatternOrigins();
  const terrainUv = uv();
  const localXZ = vec2(terrainUv.x.sub(0.5).mul(64), float(0.5).sub(terrainUv.y).mul(64));
  const chunkCenter = uniform(new THREE.Vector2(0, 0));
  const sun = vec3(0.4, 0.8, 0.4).normalize();
  const baseNormal = vec3(0, 1, 0);

  const arid = createAridSubstrateNodes({
    tileId: float(1),
    bare: float(1),
    patterns,
    localXZ,
    cameraDistance: float(12),
    sandShare: float(0.85),
    mineralShare: float(0),
    terrainUv,
    chunkWorldSize: 64,
    chunkCenter,
    material,
    sun,
    baseNormal,
  });
  const aridOut = arid.apply(vec3(0.7, 0.6, 0.4), float(0.9), baseNormal);
  assert.ok(aridOut.color && aridOut.roughness && aridOut.normal && arid.sunResponse);

  const coast = createCoastSandNodes({
    localXZ,
    patterns: coastPatterns,
    groundHeight: float(0.6),
    sandMask: float(1),
    waterCoverage: float(0),
    terrainUv,
    chunkWorldSize: 64,
    chunkCenter,
    material,
    sun,
    baseNormal,
  });
  const coastOut = coast.apply(aridOut.color, aridOut.roughness);
  assert.ok(coastOut.color && coastOut.roughness && coast.normal(aridOut.normal) && coast.sunResponse);

  const snowSurface = createSnowSurfaceNodes({
    terrainUv,
    chunkWorldSize: 64,
    chunkCenter,
    snow: float(0.9),
    stylizedConfig: { sky: { sunElevation: 24, sunAzimuth: 240 } },
    baseNormal: aridOut.normal,
    crestMask: float(0.6),
    sparkleMask: float(0.8),
  });
  assert.ok(snowSurface.sunResponse && snowSurface.snowBounce);
  applySnowLighting(material, snowSurface.sunResponse.add(arid.sunResponse).add(coast.sunResponse), {
    snowWeight: float(0.9),
    cavityOcclusion: float(0.8),
    snowBounce: snowSurface.snowBounce,
  });
  assert.equal(typeof material.setupLightingModel, 'function');
  assert.equal(createSnowDetailNodes({
    terrainUv, chunkWorldSize: 64, chunkCenter, snow: float(0.9), material,
  }), null);
  material.dispose();
});
