import assert from 'node:assert/strict';
import test from 'node:test';
import { warmLocationWater, waterNearReturn } from '../src/editor/locations/LocationWaterWarmup.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture() {
  const calls = [];
  let frames = 0;
  const renderer = { info: { memory: { total: 1024 } }, _textures: new Set(),
    initRenderTarget(target) { calls.push([target, frames]); this._textures.add(target); } };
  const target = {}, planar = {};
  const fft = { runtime: { renderer }, prepareSurfaceResources() { calls.push(['prepare', frames]); return true; },
    warmSurfaceTransform() { calls.push(['transform', frames]); return true; } };
  const reflections = { view: { renderer }, config: { reachMeters: 200 },
    surfaceWarmupTargets: () => [target, planar].filter(item => !renderer._textures.has(item))
      .map(item => ({ target: item, bytes: 64, width: 4, height: 4 })) };
  const slot = { mesh: { visible: true }, hasOceanWater: true, hasWaterCoverage: true,
    terrainSlot: { descriptor: { centerWorldX: 0, centerWorldZ: 0 } } };
  const surface = { terrainView: { chunkWorldSize: 64 }, waterSlots: [slot], oceanFft: fft, reflections };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget,
    surfaceOceanFftWarmupEnabled: true, surfaceOceanFftWarmupComputeEnabled: true, surfaceOceanFftReclamationEnabled: true,
    surfaceReflectionWarmupEnabled: true, surfaceReflectionReclamationEnabled: true };
  const args = { surface, renderer, settings, anchor: { x: 0, z: 0 },
    entries: [{ kind: 'fft', resource: fft, size: 128 }, { kind: 'reflection', resource: reflections, size: 128 }],
    initial: 1024, reserved: 0, active: () => true, pause: async () => { frames++; } };
  return { args, calls, slot, target, planar, renderer, settings };
}

test('water restoration separates FFT preparation, optional transform and reflection allocations', async () => {
  const { args, calls, target, planar } = fixture();
  assert.equal(await warmLocationWater(args), 256);
  assert.deepEqual(calls, [['prepare', 1], ['transform', 2], [target, 3], [planar, 4]]);
});

test('inland, freshwater, invisible and loading water are distinguished', async () => {
  const { args, slot, calls, target, planar } = fixture();
  assert.equal(waterNearReturn(args.surface, { x: 1000, z: 0 }, 192), false);
  slot.terrainSlot.loading = true;
  assert.equal(await warmLocationWater(args), 0);
  slot.terrainSlot.loading = false;
  slot.mesh.visible = false;
  assert.equal(await warmLocationWater(args), 0);
  slot.mesh.visible = true;
  slot.hasOceanWater = false;
  assert.equal(await warmLocationWater(args), 128);
  assert.deepEqual(calls, [[target, 1], [planar, 2]]);
});

test('shared budget, optional compute flag and ownership changes are enforced', async () => {
  const { args, settings, calls, target } = fixture();
  settings.surfaceOceanFftWarmupComputeEnabled = false;
  settings.surfaceTargetWarmupMaxBytes = 192;
  assert.equal(await warmLocationWater(args), 192);
  assert.deepEqual(calls, [['prepare', 1], [target, 2]]);
  const other = fixture();
  other.args.pause = async () => { other.args.surface.oceanFft = null; other.args.surface.reflections = null; };
  assert.equal(await warmLocationWater(other.args), 0);
  assert.deepEqual(other.calls, []);
});

test('abort after preparation prevents transform and capture allocations', async () => {
  const { args, calls } = fixture();
  const abort = new AbortController();
  args.signal = abort.signal;
  let frames = 0;
  args.pause = async () => { if (++frames === 2) abort.abort(); };
  await assert.rejects(warmLocationWater(args), { name: 'AbortError' });
  assert.equal(calls.length, 1);
});

test('water warmup flags are opt-in and byte budgets are validated', () => {
  for (const name of ['OceanFftWarmup', 'OceanFftWarmupCompute', 'ReflectionWarmup']) {
    assert.equal(resolveRenderEnhancements().locationStructureBudget['surface' + name + 'Enabled'], false);
    assert.equal(resolveRenderEnhancements({}, '?locationSurface' + name + '=1').locationStructureBudget['surface' + name + 'Enabled'], true);
  }
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceOceanFftWarmupMaxBytes: 1.5 } }), RangeError);
});
