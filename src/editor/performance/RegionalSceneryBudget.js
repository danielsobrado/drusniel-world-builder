import { PerfCounters } from './qa/PerfCounters.js';
import { chunkRingDistance, collectRegionalSceneryDemand, sceneryChunkKey } from './RegionalSceneryDemand.js';

export function evaluateSceneryDemand(cells, previous, settings) {
  const pressured = new Set();
  let maxUnits = 0;
  let totalUnits = 0;
  const totals = {};
  for (const [key, demand] of cells) {
    let units = 0;
    for (const [kind, count] of Object.entries(demand)) {
      units += count * (settings.spatialWeights[kind] ?? 0);
      totals[kind] = (totals[kind] ?? 0) + count;
    }
    maxUnits = Math.max(maxUnits, units);
    totalUnits += units;
    const limit = settings.spatialChunkBudget * (previous.has(key) ? settings.recoveryRatio : 1);
    if (units > limit) pressured.add(key);
  }
  return { pressured, maxUnits, totalUnits, totals };
}

function sameKeys(a, b) {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

/** Sample in bounded slices, publish only a complete demand estimate. */
export class RegionalSceneryBudget {
  constructor(settings) {
    this.settings = settings;
    this.townCache = new WeakMap();
    this.pressured = new Set();
    this.revision = 0;
    this.nextSample = 0;
    this.job = null;
    this.sampleWindow = null;
  }

  update(surface, now, shouldYield = () => false) {
    const focus = surface.terrainView.focusChunk;
    const size = surface.terrainView.chunkWorldSize;
    if (!focus || !(size > 0)) return;
    const window = this.job ?? this.sampleWindow;
    if (window && (window.size !== size
      || chunkRingDistance(focus.chunkX, focus.chunkZ, window.focus) > this.settings.spatialChunkRadius / 2)) {
      if (this.job) PerfCounters.inc('regionalSpatialSamplesCancelled');
      this.job = null;
      this.sampleWindow = null;
      this.nextSample = now;
      this.publish(new Set());
    }
    if (!this.job && now >= this.nextSample) {
      const anchor = { chunkX: focus.chunkX, chunkZ: focus.chunkZ };
      this.job = { focus: anchor, size,
        iterator: collectRegionalSceneryDemand(surface, anchor, size, this.settings, this.townCache) };
    }
    if (!this.job) return;
    for (let i = 0; i < this.settings.spatialWorkItems && !shouldYield(); i++) {
      const step = this.job.iterator.next();
      if (!step.done) continue;
      const result = evaluateSceneryDemand(step.value, this.pressured, this.settings);
      this.publish(result.pressured);
      PerfCounters.set('regionalSpatialSampledChunks', step.value.size);
      PerfCounters.set('regionalSpatialDemandUnits', result.totalUnits);
      PerfCounters.set('regionalSpatialPeakChunkUnits', result.maxUnits);
      for (const kind of Object.keys(this.settings.spatialWeights)) {
        PerfCounters.set(`regionalSpatialDemand.${kind}`, result.totals[kind] ?? 0);
      }
      PerfCounters.inc('regionalSpatialSamples');
      this.sampleWindow = { focus: this.job.focus, size: this.job.size };
      this.job = null;
      this.nextSample = now + this.settings.sampleIntervalMs;
      break;
    }
  }

  publish(next) {
    if (!sameKeys(this.pressured, next)) {
      this.pressured = next;
      this.revision++;
    }
    PerfCounters.set('regionalSpatialPressuredChunks', this.pressured.size);
  }

  factorForKey(key) {
    return this.pressured.has(key) ? this.settings.spatialLodFactor : 1;
  }

  /** Trim only fully distant card tiles, never the blade/card overlap or protected rings. */
  cardFactor(x, z, halfSize, focus, cameraChunk, chunkSize, handoffEnd) {
    const key = sceneryChunkKey(x, z, chunkSize);
    if (!this.pressured.has(key)) return 1;
    const cx = Math.floor(x / chunkSize), cz = Math.floor(-z / chunkSize);
    const minX = cx * chunkSize, maxX = minX + chunkSize;
    const maxZ = -cz * chunkSize, minZ = maxZ - chunkSize;
    if (x - halfSize < minX || x + halfSize > maxX || z - halfSize < minZ || z + halfSize > maxZ) return 1;
    const radius = this.settings.protectedChunkRadius;
    if (chunkRingDistance(cx, cz, focus) <= radius || chunkRingDistance(cx, cz, cameraChunk) <= radius) return 1;
    const cameraMinX = cameraChunk.chunkX * chunkSize, cameraMaxX = cameraMinX + chunkSize;
    const cameraMaxZ = -cameraChunk.chunkZ * chunkSize, cameraMinZ = cameraMaxZ - chunkSize;
    const dx = Math.max(cameraMinX - x - halfSize, x - halfSize - cameraMaxX, 0);
    const dz = Math.max(cameraMinZ - z - halfSize, z - halfSize - cameraMaxZ, 0);
    if (dx * dx + dz * dz <= handoffEnd * handoffEnd) return 1;
    return this.settings.spatialCardFactor;
  }

  dispose() {
    this.job = null;
    this.sampleWindow = null;
    this.townCache = new WeakMap();
    this.publish(new Set());
  }
}
