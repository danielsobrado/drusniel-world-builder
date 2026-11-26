import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Scene } from 'three/webgpu';
import { DrawPreparationPriority } from '../src/render/preparation/DrawPreparationPriority.js';
import { StreamedTextureWarmup } from '../src/render/preparation/StreamedTextureWarmup.js';
import { ReflectionGpuPressure } from '../src/render/reflections/ReflectionGpuPressure.js';
import { ReflectionShadowRegistry } from '../src/render/reflections/ReflectionShadowRegistry.js';
import { CellResidency, CELL_PENDING } from '../src/editor/stylized/lod/CellResidency.js';
import { StylizedVariantResidency } from '../src/editor/stylized/StylizedVariantResidency.js';
import { FrameSlack } from '../src/editor/performance/FrameSlack.js';

test('draw priorities predict canonical motion and retain FIFO progress', () => {
  const priority = new DrawPreparationPriority();
  const mesh = x => ({ matrixWorld: { elements: [...new Array(12).fill(0), x, 0, 0, 1] } });
  const far = mesh(-100), near = mesh(60);
  const pending = new Set([far, near]);
  priority.update({ x: 1000, z: 0 }, { x: 1000, z: 0 }, 0);
  priority.update({ x: 1010, z: 0 }, { x: 1000, z: 0 }, 100);
  for (let i = 0; i < 3; i++) assert.equal([...priority.ordered(pending, () => false)][0], near);
  assert.equal([...priority.ordered(pending, () => false)][0], far);
  assert.equal([...priority.ordered(pending, item => item === far)][0], far);
  priority.update({ x: 10000, z: 0 }, { x: 10000, z: 0 }, 200);
  assert.equal(priority.predicted.x, 10000, 'teleport must not extrapolate');
});

test('texture warmup admits large maps without changing material state', () => {
  const uploaded = [], renderer = { backend: { isWebGPUBackend: true }, initTexture: texture => uploaded.push(texture) };
  const warmup = new StreamedTextureWarmup(renderer);
  const texture = { isTexture: true, version: 1, image: { width: 512, height: 512 }, generateMipmaps: false };
  const material = { map: texture }, mesh = {};
  assert.equal(warmup.advance(mesh, material, 1024, () => false, { canPublish: () => false }, 0).ready, false);
  assert.equal(uploaded.length, 0);
  assert.equal(warmup.advance(mesh, material, 2 ** 20, () => false, { canPublish: () => true }, 0).bytes, 2 ** 20);
  assert.equal(warmup.advance({}, material, 2 ** 20, () => false, null, 0).bytes, 0);
  assert.equal(uploaded.length, 1);
  assert.equal(material.map, texture);
});

test('GPU pressure coalesces submissions and clears asynchronously', async () => {
  let resolve, count = 0, now = 0;
  const renderer = { backend: { isWebGPUBackend: true, device: { queue: { onSubmittedWorkDone() {
    count++; return new Promise(done => { resolve = done; });
  } } } } };
  const pressure = new ReflectionGpuPressure(renderer, () => now);
  pressure.submitted(); pressure.submitted();
  assert.equal(count, 1); assert.equal(pressure.busy, true);
  const pending = pressure.pending;
  now = 7; resolve(); await pending;
  assert.equal(pressure.busy, false); assert.equal(pressure.latencyMs, 7);
  pressure.dispose(); pressure.submitted(); assert.equal(count, 1);
});

test('overlay retag reconciliation is bounded and discovers late tags', () => {
  const scene = new Scene(), group = new Group();
  scene.add(group);
  const registry = new ReflectionShadowRegistry(scene);
  try {
    group.userData.editorOverlay = true;
    registry.refreshOverlayTags(1);
    assert.equal(registry.overlays.has(group), false);
    registry.refreshOverlayTags(1);
    assert.equal(registry.overlays.has(group), true);
  } finally { registry.dispose(); }
});

test('progressive geology publishes ready cells before blocked neighbors resolve', () => {
  const cells = new CellResidency({ cellMeters: 1, reachCells: 1, cellsPerFrame: 1, progressive: true });
  cells.refocus(0, 0);
  assert.equal(cells.step(() => CELL_PENDING), false);
  assert.equal(cells.step((x, z) => ({ x, z })), true);
  assert.equal(cells.values().length, 1);
  assert.ok(cells.pending.length > 0);
});

test('variant scanning makes bounded progress under constant frame pressure', () => {
  let reads = 0;
  const terrainView = { focusChunkKey: '0:0', focusChunk: { chunkX: 0, chunkZ: 0 },
    worldStore: { chunkSize: 4 }, tileMap: { get: () => { reads++; return 3; } } };
  const residency = new StylizedVariantResidency({ terrainView, prefetchChunks: 1, samplesPerChunkAxis: 1 });
  try {
    for (let frame = 0; frame < 40 && residency.lastScanKey === null; frame++) {
      const before = reads; residency.update(frame, () => true);
      assert.ok(reads - before <= 1);
    }
    assert.ok(residency.lastScanKey);
    assert.equal(residency.scanJob, null);
  } finally { residency.dispose(); }
});

test('recent fixed CPU spikes immediately reduce future strict slack', () => {
  let now = 0;
  const slack = new FrameSlack({ targetMs: 10, reserveMs: 0, now: () => now });
  slack.beginFrame(); now = 2; slack.endFrame();
  slack.beginFrame(); now += 9; slack.endFrame();
  slack.beginFrame();
  assert.ok(slack.strictAvailable() <= 1);
  slack.defer(() => { now += 0.5; });
  assert.equal(slack.maxDeferredUnitMs, 0.5);
});
