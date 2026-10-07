import { createSampleLookup } from './PreparedSampleTable.js';
import { resolveForestSeed } from '../stylized/forest/ForestRuntimeConfig.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { withinPreparationWindow } from './PlacementPreparationWindow.js';

const DEFAULT_CACHE_ENTRIES = 625;
const DEFAULT_CACHE_MIB = 192;
const BYTES_PER_MIB = 1024 * 1024;

/** Versioned worker preparation, separate from render residency. */
export class PreparedPlacementStore {
  constructor({ worldStore, revisionTracker, config, limit = null, maxBytes = null }) {
    this.world = worldStore;
    this.revisions = revisionTracker;
    const cacheConfig = config.preparedPlacementCache ?? {};
    this.limit = limit ?? cacheConfig.maxEntries ?? DEFAULT_CACHE_ENTRIES;
    this.maxBytes = maxBytes ?? (cacheConfig.maxMiB ?? DEFAULT_CACHE_MIB) * BYTES_PER_MIB;
    this.entries = new Map();
    this.pending = new Map();
    this.completed = [];
    this.completedHead = 0;
    this.disposed = false;
    this.clock = 0;
    this.window = null;
    this.pinnedKeys = new Set();
    this.arrayBytes = 0;
    this.overrideIndexRevision = Number.NaN;
    this.overrideIndexSources = { tile: null, height: null };
    this.overrideIndexes = { tile: new Map(), height: new Map() };
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
    this.pinnedKeys.clear();
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        this.pinnedKeys.add(`${x + dx}:${z + dz}`);
      }
    }
    for (const [key, token] of this.pending) {
      const cx = token.x;
      const cz = token.z;
      if (!withinPreparationWindow(cx, cz, this.window)) {
        this.world.chunkWorker.cancel?.(cx, cz, 'placement:');
        this.pending.delete(key);
        PerfCounters.inc('placementCancelledRequests');
      } else {
        const priority = 100 + Math.max(Math.abs(cx - x), Math.abs(cz - z));
        this.world.chunkWorker.reprioritize?.(cx, cz, priority, 'placement:');
      }
    }
    this.evictIfNeeded();
  }

  signature(x, z) { return this.revisions.signature(x, z, this.halo); }

  get(x, z) {
    const key = `${x}:${z}`;
    const entry = this.entries.get(key);
    if (entry?.signature !== this.signature(x, z)) return null;
    entry.used = ++this.clock;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.page;
  }

  rebuildOverrideIndexes() {
    const revision = this.world.revision ?? 0;
    if (revision === this.overrideIndexRevision
        && this.overrideIndexSources.tile === this.world.tileOverrides
        && this.overrideIndexSources.height === this.world.heightOverrides) {
      return;
    }
    const size = this.world.chunkSize;
    const build = (source) => {
      const buckets = new Map();
      for (const [key, value] of source) {
        const separator = key.indexOf(':');
        const x = Number(key.slice(0, separator));
        const z = Number(key.slice(separator + 1));
        const bucketKey = `${Math.floor(x / size)}:${Math.floor(z / size)}`;
        const rows = buckets.get(bucketKey) ?? [];
        rows.push({ key, value, x, z });
        buckets.set(bucketKey, rows);
      }
      return buckets;
    };
    this.overrideIndexes.tile = build(this.world.tileOverrides);
    this.overrideIndexes.height = build(this.world.heightOverrides);
    this.overrideIndexSources.tile = this.world.tileOverrides;
    this.overrideIndexSources.height = this.world.heightOverrides;
    this.overrideIndexRevision = revision;
  }

  overridesIn(kind, x, z, margin) {
    const source = kind === 'tile' ? this.world.tileOverrides : this.world.heightOverrides;
    if (source.persistedEntriesInRect) {
      const size = this.world.chunkSize;
      return source.persistedEntriesInRect(x * size - margin, (x + 1) * size + margin,
        z * size - margin, (z + 1) * size + margin);
    }
    this.rebuildOverrideIndexes();
    const size = this.world.chunkSize;
    const minX = x * size - margin;
    const maxX = (x + 1) * size + margin;
    const minZ = z * size - margin;
    const maxZ = (z + 1) * size + margin;
    const minBucketX = Math.floor(minX / size);
    const maxBucketX = Math.floor(maxX / size);
    const minBucketZ = Math.floor(minZ / size);
    const maxBucketZ = Math.floor(maxZ / size);
    const result = [];
    const index = this.overrideIndexes[kind];
    for (let bucketZ = minBucketZ; bucketZ <= maxBucketZ; bucketZ += 1) {
      for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX += 1) {
        for (const row of index.get(`${bucketX}:${bucketZ}`) ?? []) {
          if (row.x >= minX && row.x <= maxX && row.z >= minZ && row.z <= maxZ) {
            result.push([row.key, row.value]);
          }
        }
      }
    }
    return result;
  }

  evictIfNeeded() {
    let pinnedScans = 0;
    while (this.entries.size > this.limit || this.arrayBytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      const [key, entry] = oldest;
      if (this.pinnedKeys.has(key)) {
        this.entries.delete(key);
        this.entries.set(key, entry);
        pinnedScans += 1;
        if (pinnedScans >= this.entries.size) break;
        continue;
      }
      this.arrayBytes -= entry.page.arrayBytes ?? 0;
      this.entries.delete(key);
      pinnedScans = 0;
    }
  }

  request(x, z, priority) {
    if (this.disposed || this.get(x, z)) return;
    if (!withinPreparationWindow(x, z, this.window)) return;
    const key = `${x}:${z}`;
    const signature = this.signature(x, z);
    if (this.pending.get(key)?.signature === signature) return;
    this.world.chunkWorker.cancel?.(x, z, 'placement:');
    const token = { signature, started: performance.now(), x, z };
    this.pending.set(key, token);
    const margin = this.halo * this.world.chunkSize;
    const placementSamplingConfig = {
      targets: this.targets,
      ecology: this.ecology.trees.perChunk ? this.ecology : null,
      tileOverrides: this.overridesIn('tile', x, z, margin),
      heightOverrides: this.overridesIn('height', x, z, margin),
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
    while (this.completedHead < this.completed.length && !shouldYield?.()) {
      const { key, x, z, token, page } = this.completed[this.completedHead++];
      if (this.pending.get(key) !== token || token.signature !== this.signature(x, z)) {
        PerfCounters.inc('placementStaleResults');
        if (this.pending.get(key) === token) this.pending.delete(key);
        continue;
      }
      this.pending.delete(key);
      page.forestLookup = createSampleLookup(page.forestSamples);
      page.rockLookup = createSampleLookup(page.rockNodes);
      const previous = this.entries.get(key);
      this.arrayBytes += (page.arrayBytes ?? 0) - (previous?.page.arrayBytes ?? 0);
      if (previous) this.entries.delete(key);
      this.entries.set(key, { page, signature: token.signature, used: ++this.clock });
      this.world.installPreparedSamples(page);
      PerfCounters.inc('placementPreparedChunks');
      PerfCounters.set('placementPreparedLatencyMs', performance.now() - token.started);
    }
    if (this.completedHead >= 64 && this.completedHead * 2 >= this.completed.length) {
      this.completed.splice(0, this.completedHead);
      this.completedHead = 0;
    } else if (this.completedHead === this.completed.length) {
      this.completed.length = 0;
      this.completedHead = 0;
    }
    this.evictIfNeeded();
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
    for (const token of this.pending.values()) {
      this.world.chunkWorker.cancel?.(token.x, token.z, 'placement:');
    }
    if (this.world.preparedPlacementSamples === this) this.world.preparedPlacementSamples = null;
    this.entries.clear(); this.pending.clear(); this.completed.length = 0; this.completedHead = 0;
    this.pinnedKeys.clear();
    this.overrideIndexes.tile.clear();
    this.overrideIndexes.height.clear();
    this.arrayBytes = 0;
  }
}
