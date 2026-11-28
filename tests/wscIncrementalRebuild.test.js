import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';
import { createTerrainMaterialBakeConfig } from '../src/editor/materials/TerrainMaterialBakeConfig.js';
import {
  WorldSurfaceContextField, wscBaseTexture, wscEcoTexture, wscGeoTexture, wscUniforms,
} from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContextField.js';

const editorCfg = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));
const bakeCfg = yaml.load(readFileSync(new URL('../config/terrain-material-bake.yaml', import.meta.url), 'utf8'));
const config = { ...editorCfg.stylizedSurface, materialBake: createTerrainMaterialBakeConfig(bakeCfg) };

const chunkSize = 16;
const tileSize = 2;
const terrainHeight = (cellX, cellZ) => 10 + 3 * Math.sin(cellX * 0.31) + 2 * Math.cos(cellZ * 0.23);

function makeSlot(chunkX, chunkZ, revision = 1) {
  const n = chunkSize + 1;
  const heights = new Float32Array(n * n);
  for (let z = 0; z < n; z += 1) {
    for (let x = 0; x < n; x += 1) heights[z * n + x] = terrainHeight(chunkX * chunkSize + x, chunkZ * chunkSize + z) + revision;
  }
  const cells = chunkSize * chunkSize;
  const tiles = new Uint8Array(cells);
  const tilePixels = new Uint8Array(cells * 4);
  const surfaceMaskPixels = new Uint8Array(cells * 4);
  const forestFloorPixels = new Uint8Array(cells * 4);
  for (let i = 0; i < cells; i += 1) {
    const v = (i * 37 + chunkX * 11 + chunkZ * 7) & 255;
    tiles[i] = (chunkX + chunkZ) & 1 ? 4 : 8;
    tilePixels.set([90 + (v & 63), 110, 60 + (v >> 2), tiles[i]], i * 4);
    surfaceMaskPixels.set([v & 31, 255 - (v & 63), 0, 255], i * 4);
    forestFloorPixels.set([v, 255 - v, v >> 1, 255], i * 4);
  }
  return {
    descriptor: { key: `${chunkX}:${chunkZ}`, chunkX, chunkZ, originCellX: chunkX * chunkSize, originCellZ: chunkZ * chunkSize },
    page: { heights, tiles, tilePixels, surfaceMaskPixels },
    forestFloorPixels, forestFloorSize: chunkSize, forestFloorKey: `ff-${revision}`,
    materialBake: null, pageRevision: revision, loading: false,
  };
}

// A 9x9 chunk patch (288 m) with two holes, so validity edges and one-sided normals are exercised.
function makeSlots() {
  const slots = [];
  for (let cz = -4; cz <= 4; cz += 1) {
    for (let cx = -4; cx <= 4; cx += 1) if (!(cx === 1 && cz === 1) && !(cx === -2 && cz === 0)) slots.push(makeSlot(cx, cz));
  }
  return slots;
}

const snapshot = () => ({
  geo: wscGeoTexture.image.data.slice(), base: wscBaseTexture.image.data.slice(),
  eco: wscEcoTexture.image.data.slice(), baseHeight: wscUniforms.baseHeight.value,
});

function fullRebuildAt(slots, focus) {
  const field = new WorldSurfaceContextField({ terrainView: { worldStore: { chunkSize, tileSize }, slots }, config });
  try {
    field.update(focus, { x: 0, z: 0 });
    return snapshot();
  } finally {
    field.dispose();
  }
}

test('a recentred WSC window matches a full rebuild while evaluating only the uncovered strip', () => {
  const slots = makeSlots();
  const field = new WorldSurfaceContextField({ terrainView: { worldStore: { chunkSize, tileSize }, slots }, config });
  try {
    // Window centres snap to the 1 m texel grid: (5,-3) -> (21,-3) -> (21,14) -> (-9,30).
    const steps = [{ x: 5, z: -3 }, { x: 21.4, z: -3 }, { x: 21.4, z: 14 }, { x: -9, z: 30.2 }];
    const overlap = [0, (128 - 16) * 128, 128 * (128 - 17), (128 - 30) * (128 - 16)];
    for (const [index, focus] of steps.entries()) {
      const reusedBefore = PerfCounters.get('wscTexelsReused') ?? 0;
      assert.equal(field.update(focus, { x: 0, z: 0 }), true);
      const reused = (PerfCounters.get('wscTexelsReused') ?? 0) - reusedBefore;
      const incremental = snapshot();
      assert.equal(reused, overlap[index], `texels reused at step ${index}`);
      const full = fullRebuildAt(slots, focus);
      assert.equal(incremental.baseHeight, full.baseHeight, `base height at step ${index}`);
      assert.deepEqual(incremental.geo, full.geo, `geo at step ${index}`);
      assert.deepEqual(incremental.base, full.base, `base at step ${index}`);
      assert.deepEqual(incremental.eco, full.eco, `eco at step ${index}`);
      // The comparison field shared the global textures; restore this window for the next step.
      field.lastSlotSignature = '';
      field.rebuildCache.invalidate();
      field.update(focus, { x: 0, z: 0 });
    }
  } finally {
    field.dispose();
  }
});

test('a changed chunk is re-evaluated, and so are its neighbours\' border texels', () => {
  const slots = makeSlots();
  const field = new WorldSurfaceContextField({ terrainView: { worldStore: { chunkSize, tileSize }, slots }, config });
  try {
    field.update({ x: 5, z: -3 }, { x: 0, z: 0 });
    const index = slots.findIndex(slot => slot.descriptor.key === '0:0');
    slots[index] = makeSlot(0, 0, 2);
    const reusedBefore = PerfCounters.get('wscTexelsReused') ?? 0;
    field.update({ x: 5, z: -3 }, { x: 0, z: 0 });
    const reused = (PerfCounters.get('wscTexelsReused') ?? 0) - reusedBefore;
    assert.ok(reused > 0 && reused < 128 * 128, `reused ${reused}`);
    const incremental = snapshot();
    const full = fullRebuildAt(slots, { x: 5, z: -3 });
    assert.deepEqual(incremental.geo, full.geo);
    assert.deepEqual(incremental.base, full.base);
    assert.deepEqual(incremental.eco, full.eco);
  } finally {
    field.dispose();
  }
});

function assertMatchesFull(slots, focus, label) {
  const incremental = snapshot();
  const full = fullRebuildAt(slots, focus);
  assert.equal(incremental.baseHeight, full.baseHeight, `${label}: base height`);
  assert.deepEqual(incremental.geo, full.geo, `${label}: geo`);
  assert.deepEqual(incremental.base, full.base, `${label}: base`);
  assert.deepEqual(incremental.eco, full.eco, `${label}: eco`);
}

test('reuse declines for chunks that unload, are still loading, or a new world-noise version', () => {
  const slots = makeSlots();
  const field = new WorldSurfaceContextField({ terrainView: { worldStore: { chunkSize, tileSize }, slots }, config });
  const restore = () => { field.lastSlotSignature = ''; field.rebuildCache.invalidate(); };
  try {
    field.update({ x: 5, z: -3 }, { x: 0, z: 0 });
    // Unload under a fixed window.
    slots.splice(slots.findIndex(slot => slot.descriptor.key === '0:0'), 1);
    field.update({ x: 5, z: -3 }, { x: 0, z: 0 });
    assertMatchesFull(slots, { x: 5, z: -3 }, 'unloaded, fixed window');
    restore(); field.update({ x: 5, z: -3 }, { x: 0, z: 0 });
    // Unload under a moving window.
    slots.splice(slots.findIndex(slot => slot.descriptor.key === '1:0'), 1);
    field.update({ x: 21.4, z: -3 }, { x: 0, z: 0 });
    assertMatchesFull(slots, { x: 21.4, z: -3 }, 'unloaded, moved window');
    restore(); field.update({ x: 21.4, z: -3 }, { x: 0, z: 0 });
    // A slot that starts loading drops out of the window like an unloaded one.
    slots.find(slot => slot.descriptor.key === '-1:0').loading = true;
    field.update({ x: 21.4, z: -3 }, { x: 0, z: 0 });
    assertMatchesFull(slots, { x: 21.4, z: -3 }, 'loading slot');
    restore(); field.update({ x: 21.4, z: -3 }, { x: 0, z: 0 });
    // A new world-noise version rebuilds everything.
    const evaluatedBefore = PerfCounters.get('wscTexelsEvaluated') ?? 0;
    field.worldNoiseVersion += 1;
    field.update({ x: 37.4, z: -3 }, { x: 0, z: 0 });
    assert.equal((PerfCounters.get('wscTexelsEvaluated') ?? 0) - evaluatedBefore, 128 * 128);
  } finally {
    field.dispose();
  }
});

test('a budgeted cold build after a teleport is spread over frames and lands identical to a full one', () => {
  const slots = makeSlots();
  const field = new WorldSurfaceContextField({ terrainView: { worldStore: { chunkSize, tileSize }, slots }, config });
  const budget = { canPublish: () => true };
  const realNow = performance.now.bind(performance);
  let clock = 0;
  try {
    field.update({ x: -90, z: -3 }, { x: 0, z: 0 }, budget);
    // A clock that ticks 1 ms per read slices the build the same way on any machine or load.
    performance.now = () => (clock += 1);
    const target = { x: 60, z: -3 }; // 150 m: nothing in the old window is reusable
    assert.equal(field.update(target, { x: 0, z: 0 }, budget), false, 'old window no longer covers the focus');
    assert.ok(field.pendingBuild, 'the cold build is still in flight after one slice');
    // A chunk the build has already written changes while the rest is spread over frames.
    // Rows run south to north, so chunk row 0 (z in (-64, 0]) is written by three quarters.
    let frames = 1;
    while (field.pendingBuild.row < field.resolution * 0.75) { field.update(target, { x: 0, z: 0 }, budget); frames += 1; }
    assert.ok(field.pendingBuild, 'still in flight when the chunk changes');
    const index = slots.findIndex(slot => slot.descriptor.key === '2:0');
    slots[index] = makeSlot(2, 0, 3);
    while (field.pendingBuild && frames < 2000) { field.update(target, { x: 0, z: 0 }, budget); frames += 1; }
    performance.now = realNow;
    assert.equal(field.pendingBuild, null);
    assert.ok(frames > 2, `finished in ${frames} frames`);
    // The chunk that changed mid-build was recorded stale; the next build re-evaluates it
    // (itself sliced, the old window shown meanwhile).
    const evaluatedBefore = PerfCounters.get('wscTexelsEvaluated') ?? 0;
    assert.equal(field.update(target, { x: 0, z: 0 }, budget), true);
    while (field.pendingBuild) assert.equal(field.update(target, { x: 0, z: 0 }, budget), true);
    const evaluated = (PerfCounters.get('wscTexelsEvaluated') ?? 0) - evaluatedBefore;
    assert.ok(evaluated > 0 && evaluated < 128 * 128, `re-evaluated ${evaluated}`);
    assertMatchesFull(slots, target, 'after a spread-out cold build');
  } finally {
    performance.now = realNow;
    field.dispose();
  }
});

test('a budgeted 16 m recentre is sliced too, keeping the old window shown until it lands', () => {
  const slots = makeSlots();
  const field = new WorldSurfaceContextField({ terrainView: { worldStore: { chunkSize, tileSize }, slots }, config });
  const budget = { canPublish: () => true };
  const realNow = performance.now.bind(performance);
  let clock = 0;
  try {
    field.update({ x: 5, z: -3 }, { x: 0, z: 0 }, budget);
    // A clock that ticks 1 ms per read makes the 4 ms slice cut the strip deterministically.
    performance.now = () => (clock += 1);
    const target = { x: 21.4, z: -3 };
    assert.equal(field.update(target, { x: 0, z: 0 }, budget), true, 'the old window still covers the focus');
    assert.ok(field.pendingBuild?.reuse, 'a reuse build is in flight after one slice');
    assert.equal(field.centerX, 5, 'the old window is still the published one');
    let frames = 1;
    while (field.pendingBuild && frames < 400) { field.update(target, { x: 0, z: 0 }, budget); frames += 1; }
    performance.now = realNow;
    assert.equal(field.pendingBuild, null);
    assertMatchesFull(slots, target, 'after a sliced recentre');
  } finally {
    performance.now = realNow;
    field.dispose();
  }
});
