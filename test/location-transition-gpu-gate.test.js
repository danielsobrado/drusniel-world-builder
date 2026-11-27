import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationTransitionGpuGate } from '../src/editor/locations/LocationTransitionGpuGate.js';

function fixture(fence = () => Promise.resolve()) {
  let frames = 0;
  const device = { queue: { onSubmittedWorkDone: fence } };
  const renderer = { backend: { device } };
  const abort = new AbortController();
  const gate = new LocationTransitionGpuGate({ renderer,
    settings: { surfaceTransitionGpuMaxWaitFrames: 3, surfaceTransitionGpuMaxWaitMs: 5000 },
    pause: async () => { frames++; }, active: () => true, signal: abort.signal });
  return { gate, renderer, abort, frames: () => frames };
}

test('transition gate fences each batch and yields at least one frame', async () => {
  let fences = 0;
  const { gate, frames } = fixture(() => { fences++; return Promise.resolve(); });
  await gate.advance();
  await gate.advance();
  assert.equal(fences, 2);
  assert.equal(frames(), 2);
});

test('unresolved queue closes gate within configured frame limit', async () => {
  const { gate, frames } = fixture(() => new Promise(() => {}));
  await assert.rejects(gate.advance(), /budget exhausted/);
  assert.equal(frames(), 3);
  assert.equal(gate.closed, true);
  await assert.rejects(gate.advance(), /unavailable/);
  assert.equal(frames(), 3);
});

test('rejected fence closes gate without unhandled rejection', async () => {
  const { gate, frames } = fixture(() => Promise.reject(new Error('device lost')));
  await assert.rejects(gate.advance(), /budget exhausted/);
  assert.equal(frames(), 1);
  assert.equal(gate.closed, true);
});

test('cancellation, device change and renderer loss prevent more batches', async () => {
  for (const mode of ['abort', 'device', 'loss']) {
    const { gate, renderer, abort } = fixture();
    gate.pause = async () => {
      if (mode === 'abort') abort.abort();
      if (mode === 'device') renderer.backend.device = {};
      if (mode === 'loss') renderer._isDeviceLost = true;
    };
    await assert.rejects(gate.advance());
    assert.equal(gate.closed, true);
  }
});

test('missing queue completion API declines speculative submissions', async () => {
  const { gate, frames } = fixture();
  delete gate.queue.onSubmittedWorkDone;
  await assert.rejects(gate.advance(), /completion tracking/);
  assert.equal(frames(), 0);
  assert.equal(gate.closed, true);
});
