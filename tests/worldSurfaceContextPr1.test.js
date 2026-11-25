import assert from 'node:assert/strict';
import test from 'node:test';
import { positionWorld, vec2 } from 'three/tsl';
import {
  WorldSurfaceContextField,
  clearWorldSurfaceContext,
  sampleWorldSurfaceContextAt,
  sampleWorldSurfaceContextCpu,
  sampleWorldSurfaceContextVarying,
  wscBaseTexture,
  wscEcoTexture,
  wscGeoTexture,
  wscUniforms,
} from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContextField.js';
import {
  clearGroundContactField,
  groundContactEcoTexture,
  groundContactGeoTexture,
  groundContactSoilTexture,
  groundContactUniforms,
  sampleGroundContactAt,
  sampleGroundContactVarying,
} from '../src/editor/stylized/groundContact/GroundContactState.js';
import { applyShaderGroundConform } from '../src/editor/stylized/groundSeating.js';

function makeSlot({
  chunkX,
  chunkZ,
  chunkSize = 16,
  tileSize = 2,
  tileId = 8,
  heightFn = () => 20,
  canopy = 0,
  contact = 0,
  litter = 0,
  vegCoverage = 0,
  pageRevision = 1,
  forestFloorKey = 'ff-1',
}) {
  const heights = new Float32Array((chunkSize + 1) * (chunkSize + 1));
  const originCellX = chunkX * chunkSize;
  const originCellZ = chunkZ * chunkSize;
  for (let lz = 0; lz <= chunkSize; lz += 1) {
    for (let lx = 0; lx <= chunkSize; lx += 1) {
      const worldX = (originCellX + lx) * tileSize;
      const worldZ = -(originCellZ + lz) * tileSize;
      heights[lz * (chunkSize + 1) + lx] = heightFn(worldX, worldZ);
    }
  }
  const tiles = new Uint8Array(chunkSize * chunkSize).fill(tileId);
  const surfaceMaskPixels = new Uint8Array(chunkSize * chunkSize * 4);
  for (let i = 0; i < chunkSize * chunkSize; i += 1) {
    surfaceMaskPixels[i * 4 + 1] = Math.round(vegCoverage * 255);
  }
  const forestFloorSize = 16;
  const forestFloorPixels = new Uint8Array(forestFloorSize * forestFloorSize * 4);
  for (let i = 0; i < forestFloorSize * forestFloorSize; i += 1) {
    forestFloorPixels[i * 4] = Math.round(canopy * 255);
    forestFloorPixels[i * 4 + 1] = Math.round(contact * 255);
    forestFloorPixels[i * 4 + 2] = Math.round(litter * 255);
    forestFloorPixels[i * 4 + 3] = 255;
  }
  return {
    descriptor: { key: `${chunkX}:${chunkZ}`, chunkX, chunkZ, originCellX, originCellZ },
    page: { heights, tiles, surfaceMaskPixels },
    forestFloorPixels,
    forestFloorSize,
    forestFloorKey,
    pageRevision,
    loading: false,
  };
}

test('PR 1 GroundContactState backwards-compatible facade aliases canonical WSC state', () => {
  assert.equal(groundContactGeoTexture, wscGeoTexture);
  assert.equal(groundContactSoilTexture, wscBaseTexture);
  assert.equal(groundContactEcoTexture, wscEcoTexture);
  assert.equal(groundContactUniforms, wscUniforms);
  assert.equal(clearGroundContactField, clearWorldSurfaceContext);
  assert.equal(sampleGroundContactAt, sampleWorldSurfaceContextAt);
  assert.equal(sampleGroundContactVarying, sampleWorldSurfaceContextVarying);

  // Verify TSL graph constructors emit complete contract shapes without errors.
  const full = sampleWorldSurfaceContextAt(vec2(4, -4));
  for (const key of [
    'height', 'normal', 'validity', 'inside', 'windowInside', 'texelValidity',
    'albedo', 'soilColor', 'roughness', 'contact', 'canopy', 'litter', 'vegetationCoverage',
  ]) {
    assert.ok(full[key], `sampleWorldSurfaceContextAt missing field ${key}`);
  }
  const geoOnly = sampleWorldSurfaceContextAt(vec2(4, -4), { includeBase: false, includeEco: false });
  assert.ok(geoOnly.height && geoOnly.validity);
  const varied = sampleWorldSurfaceContextVarying(positionWorld.xz, 'unitTest');
  for (const key of ['height', 'normal', 'validity', 'inside', 'albedo', 'soilColor', 'roughness', 'contact', 'canopy', 'litter', 'vegetationCoverage']) {
    assert.ok(varied[key], `sampleWorldSurfaceContextVarying missing field ${key}`);
  }
  const conformed = applyShaderGroundConform(positionWorld, { height: 1.5 });
  assert.ok(conformed);
});

test('PR 1 missing/unloaded slots carry explicit validity=0 and never pull boundary heights toward 0', () => {
  clearWorldSurfaceContext();
  const chunkSize = 16;
  const tileSize = 2; // chunkWorldSize = 32 m
  // Only chunk (0, 0) covering worldX in [0, 32), worldZ in (-32, 0] is resident at height = 22.5 m.
  const loadedSlot = makeSlot({
    chunkX: 0,
    chunkZ: 0,
    chunkSize,
    tileSize,
    heightFn: () => 22.5,
    canopy: 0.72,
    contact: 0.48,
    litter: 0.64,
    vegCoverage: 0.85,
  });
  const field = new WorldSurfaceContextField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots: [loadedSlot] },
    config: { biomeLooks: { soil: { 8: '#4c5f32' } } },
  });

  // Focus in unloaded neighbor (-8, -16) so resolveBaseHeight must also fall back to resident slot (22.5 m)!
  assert.equal(field.update({ x: -8, z: -16 }, { x: 0, z: 0 }), true);
  assert.equal(wscUniforms.baseHeight.value, 22.5);

  // Inside loaded chunk (16, -16): full validity, exact height, and all ecological channels populated.
  const insideLoaded = sampleWorldSurfaceContextCpu(16, -16);
  assert.equal(insideLoaded.valid, true);
  assert.equal(insideLoaded.texelValidity, 1);
  assert.ok(insideLoaded.validity > 0.99);
  assert.ok(Math.abs(insideLoaded.height - 22.5) < 0.05, `expected 22.5, got ${insideLoaded.height}`);
  assert.ok(Math.abs(insideLoaded.contact - 0.48) < 0.02);
  assert.ok(Math.abs(insideLoaded.canopy - 0.72) < 0.02);
  assert.ok(Math.abs(insideLoaded.litter - 0.64) < 0.02);
  assert.ok(Math.abs(insideLoaded.vegetationCoverage - 0.85) < 0.02);
  assert.ok(Math.abs(insideLoaded.roughness - (230 / 255)) < 0.02);

  // Deep inside unloaded neighbor (-16, -16): explicit validity = 0, zero soil/eco leakage.
  const unloaded = sampleWorldSurfaceContextCpu(-16, -16);
  assert.equal(unloaded.valid, false);
  assert.equal(unloaded.texelValidity, 0);
  assert.equal(unloaded.validity, 0);
  assert.equal(unloaded.inside, 0);
  assert.deepEqual(unloaded.albedo, [0, 0, 0]);
  assert.equal(unloaded.contact, 0);
  assert.equal(unloaded.canopy, 0);

  // Right on the 1-texel streaming seam (worldX = 0.0, straddling loaded x=0.5 and unloaded x=-0.5):
  // validity-weighted bilinear filtering MUST keep height = 22.5 m (never dipped to 11.25 m!).
  const onSeam = sampleWorldSurfaceContextCpu(0, -16);
  assert.ok(onSeam.texelValidity > 0.45 && onSeam.texelValidity < 0.55);
  assert.ok(Math.abs(onSeam.height - 22.5) < 0.05, `seam height dipped to ${onSeam.height}`);

  // When all slots unload, field deactivates cleanly.
  field.terrainView.slots = [];
  assert.equal(field.update({ x: -8, z: -16 }, { x: 0, z: 0 }), false);
  assert.equal(wscUniforms.active.value, 0);
  field.dispose();
});

test('PR 1 chunk-edge continuity produces seamless height and slope normals across x = 0', () => {
  clearWorldSurfaceContext();
  const chunkSize = 16;
  const tileSize = 2; // 32 m chunks
  // Smooth continuous ramp: h(x, z) = 10 + 0.25 * x - 0.1 * z across chunks (-1,0) and (0,0)
  const heightFn = (x, z) => 10 + 0.25 * x - 0.1 * z;
  const west = makeSlot({ chunkX: -1, chunkZ: 0, chunkSize, tileSize, heightFn });
  const east = makeSlot({ chunkX: 0, chunkZ: 0, chunkSize, tileSize, heightFn });
  const field = new WorldSurfaceContextField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots: [west, east] },
    config: {},
  });

  assert.equal(field.update({ x: 0, z: -16 }, { x: 0, z: 0 }), true);
  const left = sampleWorldSurfaceContextCpu(-0.5, -16);
  const seam = sampleWorldSurfaceContextCpu(0.0, -16);
  const right = sampleWorldSurfaceContextCpu(0.5, -16);

  assert.equal(seam.texelValidity, 1);
  assert.ok(Math.abs(seam.height - heightFn(0, -16)) < 0.08);
  assert.ok(Math.abs(left.height - heightFn(-0.5, -16)) < 0.08);
  assert.ok(Math.abs(right.height - heightFn(0.5, -16)) < 0.08);

  // Expected unit normal for h = 10 + 0.25x - 0.1z is (-0.25, 1, +0.1) normalized.
  const invLen = 1 / Math.hypot(-0.25, 1, 0.1);
  assert.ok(Math.abs(seam.normal[0] - (-0.25 * invLen)) < 0.03, `nx=${seam.normal[0]}`);
  assert.ok(Math.abs(seam.normal[2] - (0.1 * invLen)) < 0.03, `nz=${seam.normal[2]}`);
  field.dispose();
});

test('PR 1 negative large coordinates, recentering hysteresis, and floating-origin rebasing remain invariant', () => {
  clearWorldSurfaceContext();
  const chunkSize = 64;
  const tileSize = 2; // 128 m chunks (production scale)
  // Large negative Eldara-scale canonical coordinates around (-6,724,480, -347,264).
  const baseChunkX = -52536;
  const baseChunkZ = 2712;
  const slots = [];
  const heightFn = (x, z) => 42 + 0.05 * ((x + 6724480) - (z + 347264));
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      slots.push(makeSlot({
        chunkX: baseChunkX + dx,
        chunkZ: baseChunkZ + dz,
        chunkSize,
        tileSize,
        tileId: 4,
        heightFn,
        canopy: 0.35,
        contact: 0.2,
        litter: 0.5,
        vegCoverage: 0.9,
      }));
    }
  }
  const field = new WorldSurfaceContextField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots },
    config: { biomeLooks: { soil: { 4: '#6e5c3e' } } },
  });

  const probeX = baseChunkX * 128 + 50;
  const probeZ = -(baseChunkZ * 128 + 50);

  // Initial populate around probe.
  assert.equal(field.update({ x: probeX, z: probeZ }, { x: probeX - 10, z: probeZ + 12 }), true);
  const sigInitial = field.lastSlotSignature;
  const before = sampleWorldSurfaceContextCpu(probeX, probeZ, { canonical: true });
  const beforeRender = sampleWorldSurfaceContextCpu(10, -12, { canonical: false });
  assert.equal(before.texelValidity, 1);
  assert.ok(Math.abs(before.height - beforeRender.height) < 1e-4);
  assert.deepEqual(before.albedo, beforeRender.albedo);

  // Move < 16 m hysteresis: must NOT rebuild field!
  assert.equal(field.update({ x: probeX + 10, z: probeZ - 10 }, { x: probeX - 10, z: probeZ + 12 }), true);
  assert.equal(field.lastSlotSignature, sigInitial);

  // Rebase floating origin by > 12 km without moving focus: canonicalOrigin invariant, renderOrigin shifts!
  const canonOriginBefore = [wscUniforms.canonicalOrigin.value.x, wscUniforms.canonicalOrigin.value.y];
  const newOrigin = { x: probeX - 12288, z: probeZ + 16384 };
  assert.equal(field.update({ x: probeX + 10, z: probeZ - 10 }, newOrigin), true);
  assert.deepEqual([wscUniforms.canonicalOrigin.value.x, wscUniforms.canonicalOrigin.value.y], canonOriginBefore);
  assert.equal(wscUniforms.renderOrigin.value.x, canonOriginBefore[0] - newOrigin.x);
  assert.equal(wscUniforms.renderOrigin.value.y, canonOriginBefore[1] - newOrigin.z);
  const afterRebaseRender = sampleWorldSurfaceContextCpu(probeX - newOrigin.x, probeZ - newOrigin.z, { canonical: false });
  assert.ok(Math.abs(afterRebaseRender.height - before.height) < 1e-4);
  assert.deepEqual(afterRebaseRender.albedo, before.albedo);

  // Move >= 16 m to trigger recenter: exact same canonical probe still returns identical height/albedo/eco!
  assert.equal(field.update({ x: probeX + 24, z: probeZ - 20 }, newOrigin), true);
  assert.notEqual(field.lastSlotSignature, sigInitial);
  const afterRecenter = sampleWorldSurfaceContextCpu(probeX, probeZ, { canonical: true });
  assert.equal(afterRecenter.texelValidity, 1);
  assert.ok(Math.abs(afterRecenter.height - before.height) < 0.05, `recenter height drift: ${before.height} -> ${afterRecenter.height}`);
  assert.ok(Math.abs(afterRecenter.albedo[0] - before.albedo[0]) < 0.01);
  assert.ok(Math.abs(afterRecenter.canopy - before.canopy) < 0.01);
  assert.ok(Math.abs(afterRecenter.litter - before.litter) < 0.01);
  assert.ok(Math.abs(afterRecenter.vegetationCoverage - before.vegetationCoverage) < 0.01);
  field.dispose();
});
