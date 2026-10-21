import assert from 'node:assert/strict';
import test from 'node:test';

import { TerrainAwareEditorController } from '../src/editor/TerrainAwareEditorController.js';

async function withCapturedErrors(run) {
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    await run(errors);
  } finally {
    console.error = originalError;
  }
}

test('controller notifications continue after individual listener failures', async () => {
  await withCapturedErrors(async (errors) => {
    const controller = Object.create(TerrainAwareEditorController.prototype);
    controller.getState = () => ({ ready: true });
    controller.listeners = new Set([
      () => { throw new Error('state listener failed'); },
      (value) => { controller.observedState = value; },
    ]);
    controller.mapListeners = new Set([
      () => { throw new Error('map listener failed'); },
      (value) => { controller.observedMap = value; },
    ]);
    controller.noticeListeners = new Set([
      () => { throw new Error('notice listener failed'); },
      (value) => { controller.observedNotice = value; },
    ]);
    controller.hoverListeners = new Set([
      () => { throw new Error('hover listener failed'); },
      (value) => { controller.observedHover = value; },
    ]);
    controller.tileMap = {
      get: () => 4,
      getTileDefinition: () => ({ id: 4, label: 'Grassland' }),
    };
    controller.objectMap = {
      findAt: () => null,
      getDefinition: () => null,
    };
    controller.heightField = { getCellHeight: () => 3 };

    controller.emitState();
    controller.emitMap(false);
    controller.emitNotice('saved');
    controller.emitHover({ x: 2, z: 3 });

    assert.deepEqual(controller.observedState, { ready: true });
    assert.deepEqual(controller.observedMap, { final: false });
    assert.deepEqual(controller.observedNotice, { message: 'saved', isError: false });
    assert.equal(controller.observedHover.height, 3);
    assert.equal(errors.length, 4);
  });
});

test('cold hover defers numeric sampling, coalesces the latest cell and stops retries on disposal', () => {
  const original = globalThis.requestAnimationFrame, frames = [];
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  try {
    const controller = Object.create(TerrainAwareEditorController.prototype);
    let ready = false, reads = 0, releases = 0, payload;
    Object.assign(controller, { worldStore: { chunkWorker: {}, chunkSize: 32 }, terrainView: {},
      hoverSampling: { prepare: () => ready, dispose: () => releases++ },
      tileMap: { get: () => { reads++; return 4; }, getTileDefinition: () => ({ id: 4 }) },
      objectMap: { findAt: () => null }, heightField: { getCellHeight: () => 20 },
      hoverListeners: new Set([value => { payload = value; }]) });
    controller.emitHover({ x: 1, z: 2 }); controller.emitHover({ x: 3, z: 4 });
    assert.equal(reads, 0); assert.equal(frames.length, 1);
    ready = true; frames.shift()();
    assert.deepEqual(payload, { x: 3, z: 4, tile: { id: 4 }, object: null, objectDefinition: null, height: 20 });
    assert.equal(reads, 1);
    ready = false; controller.emitHover({ x: 5, z: 6 });
    controller.emitHover(null); assert.equal(releases, 1);
    controller.hoverSamplingDisposed = true; frames.shift()();
    assert.equal(reads, 1); assert.equal(frames.length, 0);
  } finally { globalThis.requestAnimationFrame = original; }
});
