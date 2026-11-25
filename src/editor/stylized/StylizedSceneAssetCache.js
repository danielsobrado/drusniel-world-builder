import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { disposeScene, normalizeBaseUrl, resolveAssetUrl } from '../assets/assetUrl.js';
import { assetStartupTelemetry } from '../performance/AssetStartupTelemetry.js';
import { acquireKtx2Loader } from '../assets/sharedKtx2Loader.js';

function instrumentMeshoptDecoder(telemetry) {
  const decoder = Object.create(MeshoptDecoder);
  decoder.decodeGltfBufferAsync = async (...args) => {
    const startedAt = telemetry.clock();
    const decoded = await MeshoptDecoder.decodeGltfBufferAsync(...args);
    telemetry.recordMeshopt({
      durationMs: telemetry.clock() - startedAt,
      compressedBytes: args[2]?.byteLength ?? 0,
      decodedBytes: decoded?.byteLength ?? 0,
    });
    return decoded;
  };
  return decoder;
}

const PRIORITY = Object.freeze({ low: 0, auto: 1, high: 2 });

/**
 * A GLTF loader on the renderer's shared KTX2 loader. Call `release` (never
 * `ktx2Loader.dispose()`) when done: other owners share the transcoder workers.
 */
export function createStylizedSceneLoader({ renderer, baseUrl = '/', telemetry = assetStartupTelemetry }) {
  const { loader: ktx2Loader, release } = acquireKtx2Loader(renderer, baseUrl, telemetry);
  const decoder = instrumentMeshoptDecoder(telemetry);
  const createLoader = () => new GLTFLoader().setMeshoptDecoder(decoder).setKTX2Loader(ktx2Loader);
  const loader = createLoader();
  const load = loader.loadAsync.bind(loader);
  const priorityLoaders = new Map();
  let active = 0;
  let retired = false;
  loader.loadAsync = async (url, onProgress, priority = 'auto') => {
    if (retired) throw new Error('Scene loader was released.');
    const token = telemetry.beginAsset(url);
    active += 1;
    try {
      // GLTFLoader also reads priority while parsing dependencies. Keep the
      // hint on its own loader for the duration of that asynchronous parse.
      let request = load;
      if (priority !== 'auto') {
        if (!priorityLoaders.has(priority)) priorityLoaders.set(priority, createLoader().setPriority(priority));
        const prioritized = priorityLoaders.get(priority);
        request = prioritized.loadAsync.bind(prioritized);
      }
      const result = await request(url, onProgress);
      telemetry.endAsset(token);
      return result;
    } catch (error) {
      telemetry.endAsset(token, error);
      throw error;
    } finally {
      active -= 1;
      if (retired && active === 0) release();
    }
  };
  return { loader, ktx2Loader, release() {
    if (retired) return;
    retired = true;
    // KTX2Loader.dispose terminates workers without settling their promises.
    // Keep the lease until GLBs already using it finish or fail.
    if (active === 0) release();
  } };
}

/**
 * Reference-counted GLB scene cache so rocks and trees share one parse of
 * grass-scene.glb instead of loading it twice (Flyweight + acquire/release).
 */
export class StylizedSceneAssetCache {
  constructor({ loader = null, renderer = null, baseUrl = '/', requests = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    if (loader) {
      this.loader = loader;
      this.releaseKtx2 = null;
    } else {
      const configured = createStylizedSceneLoader({ renderer, baseUrl: this.baseUrl });
      this.loader = configured.loader;
      this.releaseKtx2 = configured.release;
    }
    this.entries = new Map();
    this.disposed = false;
    this.requestSettings = requests?.prioritizedRequests ? requests : null;
    this.queue = [];
    this.activeRequests = 0;
    this.requestStats = this.requestSettings ? { started: 0, finished: 0, failed: 0, cancelled: 0,
      peakActive: 0, longestWaitMs: 0, totalWaitMs: 0 } : null;
  }

  resolveUrl(path) {
    return resolveAssetUrl(this.baseUrl, path);
  }

  getRequestStatus() {
    return this.requestStats ? { ...this.requestStats, active: this.activeRequests, pending: this.queue.length } : null;
  }

  async acquire(path, { priority = 'auto' } = {}) {
    if (this.disposed) {
      throw new Error('Cannot acquire a scene asset after cache disposal.');
    }
    if (!Object.hasOwn(PRIORITY, priority)) throw new RangeError(`Invalid scene request priority: ${priority}`);
    const url = this.resolveUrl(path);
    let entry = this.entries.get(url);
    if (!entry) {
      entry = {
        url, priority, queuedAt: this.requestSettings ? performance.now() : 0, scene: null, refs: 0, state: 'queued',
      };
      entry.promise = new Promise((resolve, reject) => {
        entry.resolve = resolve;
        entry.reject = reject;
      });
      this.entries.set(url, entry);
      if (this.requestSettings) this.queue.push(entry);
    } else if (entry.state === 'queued' && PRIORITY[priority] > PRIORITY[entry.priority]) {
      entry.priority = priority;
    }

    entry.refs += 1;
    if (this.requestSettings) this.pump();
    else if (entry.state === 'queued') void this.load(entry);
    try {
      const scene = await entry.promise;
      if (this.disposed || entry.refs <= 0 || this.entries.get(url) !== entry) {
        throw new Error(`Scene asset ${url} is no longer acquired.`);
      }
      return scene;
    } catch (error) {
      entry.refs = Math.max(0, entry.refs - 1);
      throw error;
    }
  }

  pump() {
    if (this.disposed || !this.requestSettings) return;
    const { maxConcurrentRequests, requestMaxWaitMs } = this.requestSettings;
    while (this.activeRequests < maxConcurrentRequests && this.queue.length) {
      const cutoff = performance.now() - requestMaxWaitMs;
      let next = this.queue.findIndex(entry => entry.queuedAt <= cutoff);
      if (next < 0) {
        next = 0;
        for (let i = 1; i < this.queue.length; i += 1) {
          if (PRIORITY[this.queue[i].priority] > PRIORITY[this.queue[next].priority]) next = i;
        }
      }
      const [entry] = this.queue.splice(next, 1);
      void this.load(entry);
    }
  }

  async load(entry) {
    entry.state = 'loading';
    this.activeRequests += 1;
    const stats = this.requestStats;
    if (stats) {
      const waitMs = performance.now() - entry.queuedAt;
      stats.started += 1;
      stats.peakActive = Math.max(stats.peakActive, this.activeRequests);
      stats.longestWaitMs = Math.max(stats.longestWaitMs, waitMs);
      stats.totalWaitMs += waitMs;
    }
    const { url } = entry;
    try {
      const gltf = this.requestSettings
        ? await this.loader.loadAsync(url, undefined, entry.priority)
        : await this.loader.loadAsync(url);
      if (!gltf?.scene) throw new Error(`GLB ${url} contains no default scene.`);
      if (this.disposed || entry.refs <= 0 || this.entries.get(url) !== entry) {
        disposeScene(gltf.scene);
        if (stats) stats.cancelled += 1;
        throw new Error(`Scene asset ${url} was released before loading completed.`);
      }
      entry.scene = gltf.scene;
      entry.state = 'ready';
      if (stats) stats.finished += 1;
      entry.resolve(entry.scene);
    } catch (error) {
      if (stats && !this.disposed && entry.refs > 0) stats.failed += 1;
      if (this.entries.get(url) === entry) this.entries.delete(url);
      entry.reject(error);
    } finally {
      this.activeRequests -= 1;
      this.pump();
    }
  }

  release(path) {
    const url = this.resolveUrl(path);
    const entry = this.entries.get(url);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0 || entry.state === 'loading') return;
    this.entries.delete(url);
    if (entry.state === 'queued') {
      this.queue.splice(this.queue.indexOf(entry), 1);
      this.requestStats.cancelled += 1;
      entry.reject(new Error(`Scene asset ${url} was released before loading completed.`));
    }
    disposeScene(entry.scene);
    entry.scene = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.requestStats) this.requestStats.cancelled += this.queue.length;
    for (const entry of this.queue) entry.reject(new Error(`Scene asset ${entry.url} was released before loading completed.`));
    this.queue.length = 0;
    for (const entry of this.entries.values()) {
      entry.refs = 0;
      if (entry.scene) disposeScene(entry.scene);
      entry.scene = null;
    }
    this.entries.clear();
    this.releaseKtx2?.();
    this.releaseKtx2 = null;
  }
}
