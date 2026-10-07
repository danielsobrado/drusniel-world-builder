import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { StylizedBuildQueue } from './StylizedBuildQueue.js';
import { createStableChunkManifestBuilder, placementSignature } from './StableScatterManifest.js';
import { createIteratorBuilder } from './ResumableIterator.js';
import { withinPreparationWindow } from '../world/PlacementPreparationWindow.js';

/** Placement ownership is independent of render slots and lookup order. */
export class RockManifestStore {
  constructor(view) {
    this.view = view;
    this.cache = new Map();
    this.pending = new Map();
    this.halos = new Map();
    this.clock = 0;
    this.version = 0;
    this.queue = new StylizedBuildQueue({ buildsPerFrame: 16, budgetMs: view.manifestBuildBudgetMs });
    this.queue.shouldYield = () => Boolean(view.shouldYieldWork?.());
  }

  get(x, z) {
    const entry = this.cache.get(`${x}:${z}`);
    if (entry?.key !== this.view.manifestKey(x, z)) return null;
    entry.used = ++this.clock;
    return entry.placements;
  }

  setWindow(x, z, radius) {
    if (this.window?.x === x && this.window.z === z && this.window.radius === radius) return;
    this.window = { x, z, radius };
    this.queue.retain(job => withinPreparationWindow(job.chunkX, job.chunkZ, this.window));
    for (const key of this.pending.keys()) {
      const [cx, cz] = key.split(':').map(Number);
      if (!withinPreparationWindow(cx, cz, this.window)) this.pending.delete(key);
    }
  }

  request(x, z, priority = null) {
    const placements = this.get(x, z);
    if (placements !== null) return placements;
    if (!withinPreparationWindow(x, z, this.window)) return null;
    if (this.view.prototypes.length === 0) return null;
    const focus = this.view.terrainView.focusChunk;
    priority ??= focus ? Math.max(Math.abs(x - focus.chunkX), Math.abs(z - focus.chunkZ)) : 0;
    this.queue.enqueue({ key: `${x}:${z}`, chunkX: x, chunkZ: z, priority });
    return null;
  }

  blockerSnapshot(x, z, halo = 1) {
    const key = `${x}:${z}:${halo}`;
    const token = `${this.version}:${this.view.revisionTracker?.revision ?? 0}:${this.view.prototypeRevision ?? 0}:${this.view.biomeAssetPalette?.revision ?? 0}`;
    const existing = this.halos.get(key);
    if (existing?.token === token) return existing;
    const entries = [];
    let ready = true;
    for (let dz = -halo; dz <= halo; dz++) for (let dx = -halo; dx <= halo; dx++) {
      const placements = this.request(x + dx, z + dz);
      if (placements === null) ready = false;
      else entries.push(this.cache.get(`${x + dx}:${z + dz}`));
    }
    if (!ready) return null;
    const signature = entries.map(entry => entry.signature).join('|');
    const cached = this.halos.get(key);
    if (cached?.signature === signature) { cached.token = token; return cached; }
    const snapshot = { token, signature, placements: Object.freeze(entries.flatMap(e => e.placements)) };
    this.halos.set(key, snapshot);
    if (this.halos.size > 625) this.halos.delete(this.halos.keys().next().value);
    return snapshot;
  }

  createState(x, z, key) {
    return {
      key, stage: 0, placements: [],
      builder: createStableChunkManifestBuilder(this.view.manifestOptions(x, z)),
      startedAt: performance.now(),
    };
  }

  step(job, shouldYield) {
    const { chunkX: x, chunkZ: z, key: cacheKey } = job;
    if (this.get(x, z) !== null) return false;
    if (shouldYield()) return false;
    const prepared = this.view.terrainView.preparedPlacement;
    if (prepared && !prepared.ensureChunk(x, z, 2, job.priority)) {
      this.queue.enqueue(job);
      return true;
    }
    const key = this.view.manifestKey(x, z);
    let state = this.pending.get(cacheKey);
    if (state?.key !== key) {
      state = this.createState(x, z, key);
      this.pending.set(cacheKey, state);
    }
    const stageNames = ['Scatter', 'Riverbank', 'Coast', 'Seabed', 'GroundFit'];
    while (state.stage < 5 && !shouldYield()) {
      const started = performance.now();
      const placements = state.builder.step({ shouldYield });
      PerfCounters.inc(`rock${stageNames[state.stage]}Ms`, performance.now() - started);
      if (placements === null) break;
      if (state.stage === 4) state.placements = placements;
      else state.placements.push(...placements);
      state.stage++;
      if (state.stage < 4) {
        const factories = [null, 'riverbankRocksForChunk', 'coastStonesForChunk', 'seabedRocksForChunk'];
        const factory = factories[state.stage];
        state.builder = createIteratorBuilder(() => this.view[factory](x, z));
      } else if (state.stage === 4) {
        state.builder = createIteratorBuilder(() => this.view.resolveGroundPlacements(state.placements));
      }
    }
    PerfCounters.inc('rockManifestBuildSlices');
    if (state.stage < 5 || shouldYield()) {
      this.queue.enqueue(job);
      return true;
    }
    const placements = Object.freeze(state.placements);
    this.cache.set(cacheKey, {
      key, placements, signature: `${key}|${placementSignature(placements)}`, used: ++this.clock,
    });
    this.pending.delete(cacheKey);
    this.version++;
    this.view.placementsByChunk.set(cacheKey, placements);
    PerfCounters.inc('rockManifestBuilds');
    PerfCounters.set('rockManifestReadyLatencyMs', performance.now() - state.startedAt);
    // A retained CPU window is larger than the draw window; no visual radius changes.
    if (this.cache.size > 625) {
      let oldestKey = null;
      let oldest = Infinity;
      for (const [entryKey, entry] of this.cache) if (entry.used < oldest) {
        const [cx, cz] = entryKey.split(':').map(Number);
        if (this.window && withinPreparationWindow(cx, cz, this.window)) continue;
        oldest = entry.used; oldestKey = entryKey;
      }
      if (oldestKey !== null) {
        this.cache.delete(oldestKey);
        this.view.placementsByChunk.delete(oldestKey);
      }
    }
    return true;
  }

  flush() {
    const started = performance.now();
    const result = this.queue.flush((job, yieldWork) => this.step(job, yieldWork));
    PerfCounters.inc('rockManifestBuildMs', performance.now() - started);
    PerfCounters.set('rockManifestQueueDepth', result.remaining);
    PerfCounters.set('rockManifestCacheEntries', this.cache.size);
    PerfCounters.set('rockManifestOldestJobMs', this.pending.size
      ? performance.now() - Math.min(...[...this.pending.values()].map(state => state.startedAt)) : 0);
    return result;
  }

  dispose() { this.queue.clear(); this.pending.clear(); this.cache.clear(); this.halos.clear(); }
}
