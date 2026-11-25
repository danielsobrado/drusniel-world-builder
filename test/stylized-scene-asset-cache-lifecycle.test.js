import assert from 'node:assert/strict';
import test from 'node:test';
import { StylizedSceneAssetCache } from '../src/editor/stylized/StylizedSceneAssetCache.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function disposableScene() {
  const texture = {
    isTexture: true,
    disposeCount: 0,
    dispose() {
      this.disposeCount += 1;
    },
  };
  const geometry = {
    disposeCount: 0,
    dispose() {
      this.disposeCount += 1;
    },
  };
  const material = {
    map: texture,
    disposeCount: 0,
    dispose() {
      this.disposeCount += 1;
    },
  };
  const scene = {
    traverse(callback) {
      callback({ isMesh: true, geometry, material });
    },
  };
  return { scene, geometry, material, texture };
}

function createCache(pending) {
  return new StylizedSceneAssetCache({
    loader: {
      loadAsync: () => pending.promise,
    },
  });
}

test('releasing one lease rejects only that consumer of a shared load', async () => {
  const pending = deferred();
  const cache = createCache(pending);
  const asset = disposableScene();
  const released = cache.acquireLease('trees.glb');
  const retained = cache.acquireLease('trees.glb');
  released.release();
  released.release();
  await assert.rejects(released.ready, { name: 'AbortError' });
  pending.resolve({ scene: asset.scene });
  assert.equal(await retained.ready, asset.scene);
  assert.equal(asset.geometry.disposeCount, 0);
  retained.release();
  assert.equal(asset.geometry.disposeCount, 1);
});

test('network keeps progressing during decode and aborts an abandoned queued decode', async () => {
  const asset = disposableScene();
  const firstDecode = deferred();
  const secondFetch = deferred();
  const started = [];
  const cache = new StylizedSceneAssetCache({
    loader: {},
    requests: { prioritizedRequests: true, maxConcurrentRequests: 1, maxConcurrentDecodes: 1, requestMaxWaitMs: 1000 },
    loadSplit: async (url, _priority, _signal, decode) => {
      started.push(url);
      if (url === '/first.glb') return decode(() => firstDecode.promise);
      secondFetch.resolve();
      return decode(() => {
        assert.fail('cancelled queued decode was started');
      });
    },
  });
  const first = cache.acquireLease('first.glb');
  const cancelled = cache.acquireLease('second.glb');
  try {
    await secondFetch.promise;
    assert.deepEqual(started, ['/first.glb', '/second.glb']);
    assert.equal(cache.getRequestStatus().activeDecodes, 1);
    assert.equal(cache.getRequestStatus().pendingDecodes, 1);
    cancelled.release();
    await assert.rejects(cancelled.ready, { name: 'AbortError' });
    assert.equal(cache.getRequestStatus().pendingDecodes, 0);
    firstDecode.resolve({ scene: asset.scene });
    assert.equal(await first.ready, asset.scene);
  } finally {
    cache.dispose();
  }
});

test('releasing the final network lease aborts the fetch and a new lease can retry', async () => {
  const asset = disposableScene();
  let starts = 0;
  let aborted = false;
  const cache = new StylizedSceneAssetCache({
    loader: {},
    requests: { prioritizedRequests: true, maxConcurrentRequests: 1, requestMaxWaitMs: 1000 },
    loadSplit: async (_url, _priority, signal, decode) => {
      if (++starts > 1) return decode(() => ({ scene: asset.scene }));
      return new Promise((_, reject) => signal.addEventListener('abort', () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true }));
    },
  });
  try {
    const old = cache.acquireLease('trees.glb');
    old.release();
    await assert.rejects(old.ready, { name: 'AbortError' });
    assert.ok(aborted);
    assert.equal(await cache.acquireLease('trees.glb').ready, asset.scene);
    assert.equal(starts, 2);
  } finally {
    cache.dispose();
  }
});

test('an aged decode runs before newer high-priority requests', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const active = deferred();
  const order = [];
  const cache = new StylizedSceneAssetCache({
    loader: {},
    requests: { prioritizedRequests: true, maxConcurrentRequests: 3, maxConcurrentDecodes: 1, requestMaxWaitMs: 50 },
    loadSplit: async (url, _priority, _signal, decode) => decode(async () => {
      order.push(url);
      if (url === '/active.glb') await active.promise;
      return { scene: disposableScene().scene };
    }),
  });
  try {
    const first = cache.acquire('active.glb');
    now = 10;
    const low = cache.acquire('aged.glb', { priority: 'low' });
    now = 70;
    const high = cache.acquire('new.glb', { priority: 'high' });
    active.resolve();
    await Promise.all([first, low, high]);
    assert.deepEqual(order, ['/active.glb', '/aged.glb', '/new.glb']);
  } finally {
    cache.dispose();
  }
});

test('pending scene released before load completion is disposed when it arrives', async () => {
  const pending = deferred();
  const cache = createCache(pending);
  const acquisition = cache.acquire('trees.glb');
  const asset = disposableScene();

  cache.release('trees.glb');
  assert.equal(cache.entries.has('/trees.glb'), true);
  pending.resolve({ scene: asset.scene });

  await assert.rejects(acquisition, /released before loading completed/);
  assert.equal(cache.entries.has('/trees.glb'), false);
  assert.equal(asset.geometry.disposeCount, 1);
  assert.equal(asset.material.disposeCount, 1);
  assert.equal(asset.texture.disposeCount, 1);
});

test('pending scene that resolves after cache disposal is disposed', async () => {
  const pending = deferred();
  const cache = createCache(pending);
  const acquisition = cache.acquire('trees.glb');
  const asset = disposableScene();

  cache.dispose();
  pending.resolve({ scene: asset.scene });

  await assert.rejects(acquisition, /released before loading completed/);
  assert.equal(cache.entries.size, 0);
  assert.equal(asset.geometry.disposeCount, 1);
  assert.equal(asset.material.disposeCount, 1);
  assert.equal(asset.texture.disposeCount, 1);
});

test('loaded scene is disposed exactly once on final release', async () => {
  const pending = deferred();
  const cache = createCache(pending);
  const asset = disposableScene();
  const acquisition = cache.acquire('trees.glb');

  pending.resolve({ scene: asset.scene });
  assert.strictEqual(await acquisition, asset.scene);
  cache.release('trees.glb');
  cache.dispose();

  assert.equal(asset.geometry.disposeCount, 1);
  assert.equal(asset.material.disposeCount, 1);
  assert.equal(asset.texture.disposeCount, 1);
});

test('disposed scene cache rejects new acquisitions', async () => {
  const cache = createCache(deferred());
  cache.dispose();

  await assert.rejects(cache.acquire('trees.glb'), /after cache disposal/);
});

test('the prioritized GLB queue deduplicates URL aliases and passes priority to the loader', async () => {
  const pending = new Map();
  const calls = [];
  const cache = new StylizedSceneAssetCache({ baseUrl: '/world/',
    requests: { prioritizedRequests: true, maxConcurrentRequests: 1, requestMaxWaitMs: 1000 },
    loader: { loadAsync(url, onProgress, priority) {
      calls.push([url, priority]);
      const request = deferred(); pending.set(url, request); return request.promise;
    } } });
  const first = cache.acquire('first.glb');
  const low = cache.acquire('low.glb', { priority: 'low' });
  const high = cache.acquire('high.glb', { priority: 'high' });
  const alias = cache.acquire('/high.glb');
  pending.get('/world/first.glb').resolve({ scene: disposableScene().scene });
  await first;
  assert.deepEqual(calls, [['/world/first.glb', 'auto'], ['/world/high.glb', 'high']]);
  const { scene, texture } = disposableScene();
  pending.get('/world/high.glb').resolve({ scene });
  assert.equal(await high, await alias);
  cache.release('high.glb');
  assert.equal(texture.disposeCount, 0);
  cache.release('/high.glb');
  assert.equal(texture.disposeCount, 1);
  pending.get('/world/low.glb').resolve({ scene: disposableScene().scene });
  await low;
  cache.dispose();
});

test('a cancelled queued asset never starts and a fresh acquire can retry it', async () => {
  const pending = deferred();
  const asset = disposableScene();
  const calls = [];
  const cache = new StylizedSceneAssetCache({ requests: { prioritizedRequests: true, maxConcurrentRequests: 1, requestMaxWaitMs: 1000 },
    loader: { loadAsync(url) {
      calls.push(url);
      return url === '/busy.glb' ? pending.promise : Promise.resolve({ scene: asset.scene });
    } } });
  const busy = cache.acquire('busy.glb');
  const cancelled = cache.acquire('waiting.glb');
  cache.release('waiting.glb');
  await assert.rejects(cancelled, /released before loading completed/);
  const retry = cache.acquire('waiting.glb');
  pending.resolve({ scene: disposableScene().scene });
  await busy;
  assert.equal(await retry, asset.scene);
  assert.deepEqual(calls, ['/busy.glb', '/waiting.glb']);
  cache.dispose();
});
