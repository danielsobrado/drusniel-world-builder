import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LoaderUtils } from 'three';
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
  function forPriority(priority) {
    if (priority === 'auto') return loader;
    if (!priorityLoaders.has(priority)) priorityLoaders.set(priority, createLoader().setPriority(priority));
    return priorityLoaders.get(priority);
  }
  async function track(url, request) {
    if (retired) throw new Error('Scene loader was released.');
    const token = telemetry.beginAsset(url);
    active += 1;
    try {
      const result = await request();
      telemetry.endAsset(token);
      return result;
    } catch (error) {
      telemetry.endAsset(token, error);
      throw error;
    } finally {
      active -= 1;
      if (retired && active === 0) release();
    }
  }
  loader.loadAsync = (url, onProgress, priority = 'auto') => track(url, () =>
    priority === 'auto' ? load(url, onProgress) : forPriority(priority).loadAsync(url, onProgress));
  const loadSplit = (url, priority, signal, scheduleDecode) => track(url, async () => {
    const response = await fetch(url, { priority, signal });
    if (!response.ok) throw new Error(`GLB ${url} returned HTTP ${response.status}.`);
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();
    return scheduleDecode(() => forPriority(priority).parseAsync(bytes, LoaderUtils.extractUrlBase(response.url || url)));
  });
  return { loader, ktx2Loader, loadSplit, release() {
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
  constructor({ loader = null, loadSplit = null, renderer = null, baseUrl = '/', requests = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    if (loader) {
      this.loader = loader;
      this.releaseKtx2 = null;
      this.loadSplit = loadSplit;
    } else {
      const configured = createStylizedSceneLoader({ renderer, baseUrl: this.baseUrl });
      this.loader = configured.loader;
      this.releaseKtx2 = configured.release;
      this.loadSplit = configured.loadSplit;
    }
    this.entries = new Map();
    this.disposed = false;
    this.requestSettings = requests?.prioritizedRequests ? requests : null;
    this.queue = [];
    this.activeRequests = 0;
    this.decodeQueue = [];
    this.activeDecodes = 0;
    this.requestStats = this.requestSettings ? { started: 0, finished: 0, failed: 0, cancelled: 0,
      peakActive: 0, longestWaitMs: 0, totalWaitMs: 0 } : null;
  }

  resolveUrl(path) {
    return resolveAssetUrl(this.baseUrl, path);
  }

  getRequestStatus() {
    return this.requestStats ? { ...this.requestStats, active: this.activeRequests, pending: this.queue.length,
      activeDecodes: this.activeDecodes, pendingDecodes: this.decodeQueue.length } : null;
  }

  async acquire(path, options) {
    return this.acquireLease(path, options).ready;
  }

  acquireLease(path, { priority = 'auto' } = {}) {
    if (this.disposed) {
      throw new Error('Cannot acquire a scene asset after cache disposal.');
    }
    if (!Object.hasOwn(PRIORITY, priority)) throw new RangeError(`Invalid scene request priority: ${priority}`);
    const url = this.resolveUrl(path);
    let entry = this.entries.get(url);
    if (!entry) {
      entry = {
        url, priority, queuedAt: this.requestSettings ? performance.now() : 0, scene: null, refs: 0, state: 'queued',
        controller: this.requestSettings && this.loadSplit ? new AbortController() : null,
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
    let rejectReleased;
    let released = false;
    const cancellation = new Promise((_, reject) => { rejectReleased = reject; });
    const ready = Promise.race([entry.promise, cancellation]).then(scene => {
      if (released || this.disposed || entry.refs <= 0 || this.entries.get(url) !== entry) {
        throw new Error(`Scene asset ${url} is no longer acquired.`);
      }
      return scene;
    }).catch(error => {
      if (!released) this.releaseEntry(entry);
      released = true;
      throw error;
    });
    return {
      ready,
      release: () => {
        if (released) return;
        released = true;
        this.releaseEntry(entry);
        rejectReleased(new DOMException(`Scene asset ${url} was released.`, 'AbortError'));
      },
      promote: (next) => {
        if (!released && PRIORITY[next] > PRIORITY[entry.priority]) entry.priority = next;
      },
    };
  }

  pump() {
    if (this.disposed || !this.requestSettings) return;
    const { maxConcurrentRequests, requestMaxWaitMs } = this.requestSettings;
    while (this.activeRequests < maxConcurrentRequests && this.decodeQueue.length < maxConcurrentRequests && this.queue.length) {
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
    let network = true;
    const endNetwork = () => {
      network = false;
      this.activeRequests -= 1;
      this.pump();
    };
    try {
      const gltf = entry.controller
        ? await this.loadSplit(url, entry.priority, entry.controller.signal, (decode) => {
          const decoded = this.scheduleDecode(entry, decode);
          endNetwork();
          return decoded;
        })
        : this.requestSettings
        ? await this.loader.loadAsync(url, undefined, entry.priority)
        : await this.loader.loadAsync(url);
      if (!gltf?.scene) throw new Error(`GLB ${url} contains no default scene.`);
      if (this.disposed || entry.refs <= 0 || this.entries.get(url) !== entry) {
        disposeScene(gltf.scene);
        throw new Error(`Scene asset ${url} was released before loading completed.`);
      }
      entry.scene = gltf.scene;
      entry.state = 'ready';
      if (stats) stats.finished += 1;
      entry.resolve(entry.scene);
    } catch (error) {
      if (stats && (entry.refs <= 0 || this.disposed || entry.controller?.signal.aborted)) stats.cancelled += 1;
      else if (stats) stats.failed += 1;
      if (this.entries.get(url) === entry) this.entries.delete(url);
      entry.reject(error);
    } finally {
      if (network) endNetwork();
    }
  }

  scheduleDecode(entry, decode) {
    return new Promise((resolve, reject) => {
      const { signal } = entry.controller;
      signal.throwIfAborted();
      const job = { entry, decode, resolve, reject, start: null };
      const cancel = () => {
        this.decodeQueue.splice(this.decodeQueue.indexOf(job), 1);
        reject(signal.reason);
        this.pump();
      };
      job.start = () => signal.removeEventListener('abort', cancel);
      signal.addEventListener('abort', cancel, { once: true });
      this.decodeQueue.push(job);
      this.pumpDecodes();
    });
  }

  pumpDecodes() {
    while (!this.disposed && this.activeDecodes < (this.requestSettings.maxConcurrentDecodes ?? 2) && this.decodeQueue.length) {
      const next = this.decodeQueue.reduce((best, job, i, queue) =>
        PRIORITY[job.entry.priority] > PRIORITY[queue[best].entry.priority] ? i : best, 0);
      const [job] = this.decodeQueue.splice(next, 1);
      job.start();
      this.activeDecodes += 1;
      Promise.resolve().then(job.decode).then(job.resolve, job.reject).finally(() => {
        this.activeDecodes -= 1;
        this.pumpDecodes();
        this.pump();
      });
    }
  }

  release(path) {
    const url = this.resolveUrl(path);
    const entry = this.entries.get(url);
    if (entry) this.releaseEntry(entry);
  }

  releaseEntry(entry) {
    const { url } = entry;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0 || this.entries.get(url) !== entry || (entry.state === 'loading' && !entry.controller)) return;
    this.entries.delete(url);
    if (entry.state === 'queued') {
      this.queue.splice(this.queue.indexOf(entry), 1);
      this.requestStats.cancelled += 1;
      entry.reject(new Error(`Scene asset ${url} was released before loading completed.`));
    }
    entry.controller?.abort();
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
      entry.controller?.abort();
      if (entry.scene) disposeScene(entry.scene);
      entry.scene = null;
    }
    this.entries.clear();
    this.releaseKtx2?.();
    this.releaseKtx2 = null;
  }
}
