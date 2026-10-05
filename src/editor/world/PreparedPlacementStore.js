import { createSampleLookup } from './PreparedSampleTable.js';
import { resolveForestSeed } from '../stylized/forest/ForestRuntimeConfig.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { withinPreparationWindow } from './PlacementPreparationWindow.js';

/** Versioned worker preparation, separate from render residency. */
export class PreparedPlacementStore {
  constructor({ worldStore, revisionTracker, config, limit = 625 }) {
    this.world = worldStore;
    this.revisions = revisionTracker;
    this.limit = limit;
    this.entries = new Map();
    this.pending = new Map();
    this.completed = [];
    this.disposed = false;
    this.clock = 0;
    this.window = null;
    this.arrayBytes = 0;
    this.world.preparedPlacementSamples = this;
    const tileSize = worldStore.tileSize;
    this.ecology = { trees: config.trees, rocks: config.rocks, regionalPlacement: config.regionalPlacement,
      seed: resolveForestSeed(worldStore), tileSize };
    this.targets = [];
    const waterRange = Number(config.trees.habitat?.waterRangeMeters) || 0;
    if (waterRange > 0) this.targets.push({ label: 'water', maxCells: Math.ceil(waterRange / tileSize), targetTileId: config.water.tileId ?? 0 });
    if (config.path?.clearCells > 0) this.targets.push({ label: 'path', maxCells: config.path.clearCells, targetTileId: config.path.tileId ?? 13 });
    const slopeCells = (Number(config.trees.habitat?.slopeSampleDistance) || 4) / tileSize;
    const rockGridCells = (Number(config.rocks?.clusterSampleSpacing) || 6) / tileSize;
    this.halo = Math.ceil((Math.max(0, ...this.targets.map(t => t.maxCells),
      slopeCells + rockGridCells) + 1) / worldStore.chunkSize);
  }

  setWindow(x, z, radius) {
    if (this.window?.x === x && this.window.z === z && this.window.radius === radius) return;
    if ((radius * 2 + 1) ** 2 > this.limit) throw new Error('Placement cache cannot hold its dependency window.');
    this.window = { x, z, radius };
    for (const key of this.pending.keys()) {
      const [cx, cz] = key.split(':').map(Number);
      if (!withinPreparationWindow(cx, cz, this.window)) {
        this.world.chunkWorker.cancel?.(cx, cz, 'placement:');
        this.pending.delete(key);
        PerfCounters.inc('placementCancelledRequests');
      } else {
        const priority = 100 + Math.max(Math.abs(cx - x), Math.abs(cz - z));
        this.world.chunkWorker.reprioritize?.(cx, cz, priority, 'placement:');
      }
    }
  }

  signature(x, z) { return this.revisions.signature(x, z, this.halo); }

  get(x, z) {
    const entry = this.entries.get(`${x}:${z}`);
    if (entry?.signature !== this.signature(x, z)) return null;
    entry.used = ++this.clock;
    return entry.page;
  }

  overridesIn(map, x, z, margin) {
    const size = this.world.chunkSize;
    const result = [];
    for (const [key, value] of map) {
      const [cx, cz] = key.split(':').map(Number);
      if (cx >= x * size - margin && cx <= (x + 1) * size + margin
        && cz >= z * size - margin && cz <= (z + 1) * size + margin) result.push([key, value]);
    }
    return result;
  }

  request(x, z, priority) {
    if (this.disposed || this.get(x, z)) return;
    if (!withinPreparationWindow(x, z, this.window)) return;
    const key = `${x}:${z}`;
    const signature = this.signature(x, z);
    if (this.pending.get(key)?.signature === signature) return;
    this.world.chunkWorker.cancel?.(x, z, 'placement:');
    const token = { signature, started: performance.now() };
    this.pending.set(key, token);
    const margin = this.halo * this.world.chunkSize;
    const placementSamplingConfig = {
      targets: this.targets,
      ecology: this.ecology.trees.perChunk ? this.ecology : null,
      tileOverrides: this.overridesIn(this.world.tileOverrides, x, z, margin),
      heightOverrides: this.overridesIn(this.world.heightOverrides, x, z, margin),
    };
    this.world.chunkWorker.request(x, z, { priority: priority + 100, placementSamplingConfig })
      .then(page => {
        if (!this.disposed && this.pending.get(key) === token) this.completed.push({ key, x, z, token, page });
        else PerfCounters.inc('placementStaleResults');
      })
      .catch(error => {
        if (this.pending.get(key) === token) this.pending.delete(key);
        if (!error.cancelled && !this.disposed) console.error('Placement preparation failed.', error);
      });
  }

  ensureChunk(x, z, halo = 0, priority = 0) {
    let ready = true;
    for (let dz = -halo; dz <= halo; dz++) for (let dx = -halo; dx <= halo; dx++) {
      if (!this.get(x + dx, z + dz)) { this.request(x + dx, z + dz, priority); ready = false; }
    }
    return ready;
  }

  flush(shouldYield = null) {
    while (this.completed.length && !shouldYield?.()) {
      const { key, x, z, token, page } = this.completed.shift();
      if (this.pending.get(key) !== token || token.signature !== this.signature(x, z)) {
        PerfCounters.inc('placementStaleResults');
        if (this.pending.get(key) === token) this.pending.delete(key);
        continue;
      }
      this.pending.delete(key);
      page.forestLookup = createSampleLookup(page.forestSamples);
      page.rockLookup = createSampleLookup(page.rockNodes);
      this.arrayBytes += (page.arrayBytes ?? 0) - (this.entries.get(key)?.page.arrayBytes ?? 0);
      this.entries.set(key, { page, signature: token.signature, used: ++this.clock });
      this.world.installPreparedSamples(page);
      PerfCounters.inc('placementPreparedChunks');
      PerfCounters.set('placementPreparedLatencyMs', performance.now() - token.started);
    }
    if (this.entries.size > this.limit) {
      const ordered = [...this.entries].filter(([key]) => {
        const [x, z] = key.split(':').map(Number);
        return !this.window || !withinPreparationWindow(x, z, this.window);
      }).sort((a, b) => a[1].used - b[1].used);
      for (const [key, entry] of ordered.slice(0, this.entries.size - this.limit)) {
        this.arrayBytes -= entry.page.arrayBytes ?? 0;
        this.entries.delete(key);
      }
    }
    PerfCounters.set('placementPreparedEntries', this.entries.size);
    PerfCounters.set('placementPreparedPending', this.pending.size);
    PerfCounters.set('placementPreparedArrayBytes', this.arrayBytes);
    let oldestRequest = Number.POSITIVE_INFINITY;
    for (const token of this.pending.values()) {
      if (token.started < oldestRequest) oldestRequest = token.started;
    }
    PerfCounters.set('placementOldestRequestMs', this.pending.size
      ? performance.now() - oldestRequest : 0);
  }

  forestSample(x, z) {
    const size = this.world.chunkSize * this.world.tileSize;
    return this.get(Math.floor(x / size), Math.floor(-z / size))?.forestLookup?.get(`${x}:${z}`) ?? null;
  }

  rockNode(x, z, spacing) {
    const size = this.world.chunkSize * this.world.tileSize;
    return this.get(Math.floor(x * spacing / size), Math.floor(-z * spacing / size))?.rockLookup?.get(`${x}:${z}`) ?? null;
  }

  field(label, x, z) { return this.get(x, z)?.fields[label] ?? null; }

  dispose() {
    this.disposed = true;
    for (const key of this.pending.keys()) {
      const [x, z] = key.split(':').map(Number);
      this.world.chunkWorker.cancel?.(x, z, 'placement:');
    }
    if (this.world.preparedPlacementSamples === this) this.world.preparedPlacementSamples = null;
    this.entries.clear(); this.pending.clear(); this.completed.length = 0;
    this.arrayBytes = 0;
  }
}
