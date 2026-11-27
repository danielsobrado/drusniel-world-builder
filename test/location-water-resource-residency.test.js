import assert from 'node:assert/strict';
import test from 'node:test';
import { CubeRenderTarget, RenderTarget, DataTexture, HalfFloatType } from 'three/webgpu';
import { LocationSurfaceResidency } from '../src/editor/locations/LocationSurfaceResidency.js';
import { WaterReflectionController } from '../src/render/reflections/WaterReflectionController.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture(overrides = {}) {
  const resident = new Set(), restored = [];
  const texture = new DataTexture(new Uint8Array(16).fill(7), 2, 2);
  resident.add(texture);
  texture.addEventListener('dispose', () => resident.delete(texture));
  const mesh = { userData: { terrainMaterialBakeGpu: { textures: { wetnessShoreline: texture, canopyWater: texture } } } };
  const slot = { mesh, descriptor: { centerWorldX: 900, centerWorldZ: 0 } };
  const owner = size => ({
    bytes: size, calls: 0,
    surfaceReclaimableBytes() { return this.bytes; },
    suspendSurfaceResources() { this.calls++; this.bytes = 0; return true; },
  });
  const fft = owner(128), reflection = owner(256);
  const surface = { terrainView: { slots: [slot], chunkWorldSize: 64 }, waterSlots: [], oceanFft: fft, reflections: reflection };
  const renderer = { backend: { isWebGPUBackend: true }, _textures: resident, initTexture(t) { restored.push(t); resident.add(t); } };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, surfaceTerrainBakeReclamationEnabled: true,
    surfaceOceanFftReclamationEnabled: true, surfaceReflectionReclamationEnabled: true, surfaceIdleMs: 10, surfaceSampleMs: 10,
    surfaceEvictionsPerSample: 4, surfaceMaxEvictedBytes: 512, surfaceRestoreBytesPerFrame: 16, ...overrides };
  const controller = new LocationSurfaceResidency(surface, renderer, settings, async () => {});
  return { controller, texture, fft, reflection, resident, restored, surface };
}

test('shared bake channel is reclaimed once and derived owners are left to regenerate on demand', async () => {
  const { controller, texture, fft, reflection, restored, resident } = fixture();
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.equal(controller.evictedBytes, 400);
  assert.equal(controller.evicted.size, 3);
  assert.equal(fft.calls, 1);
  assert.equal(reflection.calls, 1);
  assert.equal(resident.has(texture), false);
  await controller.restore();
  assert.deepEqual(restored, [texture]);
  assert.ok(texture.image.data.every(v => v === 7));
  assert.equal(fft.bytes, 0);
  assert.equal(reflection.bytes, 0);
});

test('derived water owners cannot bypass the shared eviction cap', () => {
  const { controller, fft, reflection } = fixture({ surfaceMaxEvictedBytes: 144 });
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.equal(fft.calls, 1);
  assert.equal(reflection.calls, 0);
  assert.equal(controller.evictedBytes, 144);
});

test('reflection suspension invalidates both captures and switches bindings before disposal', () => {
  const targets = [new CubeRenderTarget(16, { type: HalfFloatType }), new CubeRenderTarget(16, { type: HalfFloatType })];
  const planarTarget = new RenderTarget(32, 16, { type: HalfFloatType });
  const resident = new Set([...targets.map(t => t.texture), planarTarget.texture]);
  const controller = Object.assign(Object.create(WaterReflectionController.prototype), {
    view: { renderer: { backend: { isWebGPUBackend: true }, _textures: resident } },
    targets, planarTarget, cube: { value: targets[0].texture }, planar: { value: planarTarget.texture },
    valid: { value: 1 }, planarValid: { value: 1 }, face: 3, gpuPressure: { busy: false },
  });
  for (const target of [...targets, planarTarget]) target.addEventListener('dispose', () => {
    assert.equal(controller.valid.value, 0);
    assert.equal(controller.planarValid.value, 0);
    assert.notEqual(controller.cube.value, target.texture);
    assert.notEqual(controller.planar.value, target.texture);
    resident.delete(target.texture);
  });
  controller.gpuPressure.busy = true;
  assert.equal(controller.suspendSurfaceResources(), false);
  controller.gpuPressure.busy = false;
  assert.equal(controller.suspendSurfaceResources(), true);
  assert.equal(controller.face, 0);
  assert.equal(resident.size, 0);
  assert.equal(controller.cube.value, controller.surfaceFallbackCube.texture);
  assert.equal(controller.planar.value, controller.surfaceFallbackPlanar.texture);
  assert.equal(controller.suspendSurfaceResources(), false);
  controller.surfaceFallbackCube.dispose();
  controller.surfaceFallbackPlanar.dispose();
});

test('all three options are independently disabled by default', () => {
  for (const [parameter, key] of [['locationSurfaceTerrainBakeReclamation', 'surfaceTerrainBakeReclamationEnabled'],
    ['locationSurfaceOceanFftReclamation', 'surfaceOceanFftReclamationEnabled'],
    ['locationSurfaceReflectionReclamation', 'surfaceReflectionReclamationEnabled']]) {
    assert.equal(resolveRenderEnhancements().locationStructureBudget[key], false);
    assert.equal(resolveRenderEnhancements({}, '?' + parameter + '=1').locationStructureBudget[key], true);
  }
});
