import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTexture, EquirectangularReflectionMapping } from 'three/webgpu';
import { environmentShape, estimateEnvironmentFilterBytes, warmLocationEnvironment } from '../src/editor/locations/LocationEnvironmentWarmup.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

const MIB = 1024 * 1024;

function fixture() {
  const texture = new DataTexture(new Uint8Array(16), 4, 1);
  texture.mapping = EquirectangularReflectionMapping;
  const scene = { environment: texture };
  const surface = { terrainView: { scene }, skyView: { environment: { surfaceTexture: texture } } };
  const renderer = { info: { memory: { total: MIB } }, _textures: new Set(),
    initTexture(value) { this._textures.add(value); } };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget,
    surfaceEnvironmentReclamationEnabled: true, surfaceEnvironmentWarmupEnabled: true };
  const entries = [{ environment: true, resource: texture, sourceBytes: 16,
    environmentShape: environmentShape(texture) }];
  let frames = 0;
  const calls = [];
  const args = { surface, renderer, settings, entries, initial: MIB, reserved: 0,
    active: () => true, pause: async () => { frames++; },
    generate(r, value) { calls.push(['filter', frames, value]); return r._textures.has(value); } };
  renderer.initTexture = value => { calls.push(['upload', frames, value]); renderer._textures.add(value); };
  return { texture, scene, renderer, settings, args, calls };
}

test('r187 PMREM estimate respects minimum face and full mip chain', () => {
  assert.equal(estimateEnvironmentFilterBytes(4), 4 * MIB);
  assert.equal(estimateEnvironmentFilterBytes(2048), 16 * MIB);
});

test('environment upload and cached filter generation occur on separate yields', async () => {
  const { args, calls, texture, scene } = fixture();
  await warmLocationEnvironment(args);
  assert.deepEqual(calls, [['upload', 1, texture], ['filter', 2, texture]]);
  assert.equal(scene.environment, texture);
});

test('shared charge, headroom, source ownership and disabled flag block warmup', async () => {
  for (const mode of ['shared', 'pressure', 'ownership', 'disabled', 'missing']) {
    const { args, calls, scene, settings, renderer } = fixture();
    if (mode === 'shared') args.reserved = settings.surfaceTargetWarmupMaxBytes - MIB;
    if (mode === 'pressure') renderer.info.memory.total = settings.surfaceAdaptiveHighMiB * MIB;
    if (mode === 'ownership') scene.environment = null;
    if (mode === 'disabled') settings.surfaceEnvironmentWarmupEnabled = false;
    if (mode === 'missing') delete renderer.info.memory;
    await warmLocationEnvironment(args);
    assert.equal(calls.length, 0, mode);
  }
});

test('ownership changes or cancellation between upload and filtering prevent generation', async () => {
  for (const mode of ['replace', 'abort', 'loss']) {
    const { args, calls, scene, renderer } = fixture();
    const abort = new AbortController();
    args.signal = abort.signal;
    let frames = 0;
    args.pause = async () => {
      if (++frames !== 2) return;
      if (mode === 'replace') scene.environment = null;
      if (mode === 'abort') abort.abort();
      if (mode === 'loss') renderer._isDeviceLost = true;
    };
    if (mode === 'abort') await assert.rejects(warmLocationEnvironment(args), { name: 'AbortError' });
    else await warmLocationEnvironment(args);
    assert.equal(calls.length, 1, mode);
  }
});

test('environment warmup is opt-in and byte ceiling is validated', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceEnvironmentWarmupEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceEnvironmentWarmup=1').locationStructureBudget.surfaceEnvironmentWarmupEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceEnvironmentWarmupMaxBytes: 1.5 } }), RangeError);
});
