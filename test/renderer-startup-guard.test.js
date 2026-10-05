import assert from 'node:assert/strict';
import test from 'node:test';
import { RendererStartupGuard } from '../src/editor/lifecycle/RendererStartupGuard.js';
import { RendererRecovery } from '../src/editor/lifecycle/RendererRecovery.js';

test('startup loss rejects an unresolved shader compile and restores its handler', async () => {
  const original = () => {}; const renderer = { onDeviceLost: original };
  const guard = new RendererStartupGuard(); guard.attach(renderer);
  const waiting = guard.wait(new Promise(() => {}));
  renderer.onDeviceLost({ message: 'test loss' });
  await assert.rejects(waiting, /test loss/);
  await assert.rejects(guard.wait(Promise.resolve(1)), /test loss/);
  guard.dispose(); assert.equal(renderer.onDeviceLost, original);
});

test('a live recovery handler survives startup guard disposal', async () => {
  const renderer = {}; const guard = new RendererStartupGuard(); guard.attach(renderer);
  assert.equal(await guard.wait(Promise.resolve(1)), 1);
  const live = () => {}; renderer.onDeviceLost = live; guard.dispose();
  assert.equal(renderer.onDeviceLost, live);
});

test('loss during retry falls back to WebGL with the same captured state', async () => {
  const state = { document: { seed: 7 }, history: [1] }, backends = [];
  const recovery = new RendererRecovery({ capture: () => state, release() {},
    restart: async (backend, received) => {
      assert.equal(received, state); backends.push(backend);
      if (backend === 'webgpu') {
        const guard = new RendererStartupGuard(); const renderer = {}; guard.attach(renderer);
        const ready = guard.wait(new Promise(() => {})); renderer.onDeviceLost({ reason: 'destroyed' });
        await ready;
      }
    }, onFailure: () => assert.fail('fallback should succeed') });
  await recovery.recover('auto', 'webgpu'); assert.deepEqual(backends, ['webgpu', 'webgl']);
  assert.equal(recovery.attempts, 2); assert.equal(recovery.phase, 'idle');
});

test('a second loss after successful recovery spends the remaining attempt on fallback', async () => {
  const backends = [];
  const recovery = new RendererRecovery({ capture: () => ({}), release() {},
    restart: backend => backends.push(backend), onFailure: () => {} });
  await recovery.recover('auto', 'webgpu'); await recovery.recover('auto', 'webgpu');
  assert.deepEqual(backends, ['webgpu', 'webgl']);
});
