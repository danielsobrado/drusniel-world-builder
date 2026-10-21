/**
 * Which line segments (river reaches) can reach a block of cells.
 *
 * An imported Azgaar map carries thousands of kilometres of river. Bucketing
 * every reach into every fine block its buffered line crosses built millions of
 * string-keyed buckets at load: several hundred megabytes of the editor's 4 GB
 * heap (docs/perf-qa.md). Here segments are bucketed eagerly only into coarse
 * cells (`coarseBlocks` fine blocks a side, integer keys), and a fine block's
 * list is derived on first use from its coarse cell — a conservative distance
 * test, so it is a superset of the segments that can matter — and kept in a
 * bounded cache. Lists keep insertion order, so callers that break ties by
 * order see the same order as before.
 */

const KEY_BIAS = 1 << 20;
const KEY_STRIDE = 1 << 21;

function key(x, z) {
  return (x + KEY_BIAS) * KEY_STRIDE + (z + KEY_BIAS);
}

function distanceToSegment(x, z, entry) {
  const amount = entry.lengthSquared > 0
    ? Math.max(0, Math.min(1, ((x - entry.ax) * entry.dx + (z - entry.az) * entry.dz) / entry.lengthSquared))
    : 0;
  return Math.hypot(x - (entry.ax + entry.dx * amount), z - (entry.az + entry.dz * amount));
}

export class SegmentBlockIndex {
  /**
   * @param {object} options
   * @param {number} options.blockSize fine block, in cells
   * @param {number} [options.coarseBlocks] fine blocks per coarse cell side
   * @param {number} [options.cacheLimit] fine blocks kept
   */
  constructor({ blockSize, coarseBlocks = 32, cacheLimit = 16384 }) {
    this.blockSize = blockSize;
    this.coarseCells = blockSize * coarseBlocks;
    this.cacheLimit = cacheLimit;
    this.coarse = new Map();
    this.fine = new Map();
  }

  /**
   * @param {object} segment `{ ax, az, dx, dz, length }` in cells; stored as given
   * @param {number} margin the furthest, in cells, it can reach from its line
   */
  add(segment, margin) {
    const cells = this.coarseCells;
    const step = cells * 0.5;
    const reach = Math.ceil((margin + step * 0.5) / cells);
    const steps = Math.max(1, Math.ceil(segment.length / step));
    const keys = new Set();
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const cellX = Math.floor((segment.ax + segment.dx * t) / cells);
      const cellZ = Math.floor((segment.az + segment.dz * t) / cells);
      for (let offsetZ = -reach; offsetZ <= reach; offsetZ += 1) {
        for (let offsetX = -reach; offsetX <= reach; offsetX += 1) keys.add(key(cellX + offsetX, cellZ + offsetZ));
      }
    }
    const entry = {
      segment, margin, ax: segment.ax, az: segment.az, dx: segment.dx, dz: segment.dz,
      lengthSquared: segment.length * segment.length,
    };
    for (const coarseKey of keys) {
      const bucket = this.coarse.get(coarseKey);
      if (bucket) bucket.push(entry);
      else this.coarse.set(coarseKey, [entry]);
    }
    this.fine.clear();
  }

  /** Segments that may reach the fine block containing a cell, in insertion order. */
  at(cellX, cellZ) {
    const blockX = Math.floor(cellX / this.blockSize);
    const blockZ = Math.floor(cellZ / this.blockSize);
    const fineKey = key(blockX, blockZ);
    const cached = this.fine.get(fineKey);
    if (cached) return cached;
    const bucket = this.coarse.get(key(
      Math.floor(blockX * this.blockSize / this.coarseCells),
      Math.floor(blockZ * this.blockSize / this.coarseCells),
    ));
    const half = this.blockSize * 0.5;
    const centreX = blockX * this.blockSize + half;
    const centreZ = blockZ * this.blockSize + half;
    const slack = half * Math.SQRT2;
    const list = bucket
      ? bucket.filter((entry) => distanceToSegment(centreX, centreZ, entry) <= entry.margin + slack)
        .map((entry) => entry.segment)
      : [];
    if (this.fine.size >= this.cacheLimit) this.fine.delete(this.fine.keys().next().value);
    this.fine.set(fineKey, list);
    return list;
  }
}
