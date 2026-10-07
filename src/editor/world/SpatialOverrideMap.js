import { cellKey, parseCellKey } from './WorldCoordinates.js';

/** Persistence-compatible map with sparse numeric blocks for runtime queries. */
export class SpatialOverrideMap extends Map {
  constructor(chunkSize, entries = []) {
    super();
    this.chunkSize = chunkSize;
    this.blocks = new Map();
    this.versions = new Map();
    this.version = 0;
    this.epoch = 0;
    this.lastX = Number.NaN;
    this.lastZ = Number.NaN;
    this.lastBlock = null;
    for (const [key, value] of entries) this.set(key, value);
  }

  block(x, z) {
    if (x !== this.lastX || z !== this.lastZ) {
      this.lastX = x;
      this.lastZ = z;
      this.lastBlock = this.blocks.get(x)?.get(z) ?? null;
    }
    return this.lastBlock;
  }

  getAt(x, z) {
    if (this.size === 0) return undefined;
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    return this.block(cx, cz)?.get((z - cz * this.chunkSize) * this.chunkSize + x - cx * this.chunkSize);
  }

  hasAt(x, z) { return this.getAt(x, z) !== undefined; }

  set(key, value) {
    const { chunkX: x, chunkZ: z } = parseCellKey(key);
    if (super.has(key) && super.get(key) === value) return this;
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    let column = this.blocks.get(cx);
    if (!column) this.blocks.set(cx, column = new Map());
    let block = column.get(cz);
    if (!block) column.set(cz, block = new Map());
    block.set((z - cz * this.chunkSize) * this.chunkSize + x - cx * this.chunkSize, value);
    this.mark(cx, cz);
    return super.set(key, value);
  }

  delete(key) {
    if (!super.delete(key)) return false;
    const { chunkX: x, chunkZ: z } = parseCellKey(key);
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const column = this.blocks.get(cx);
    const block = column.get(cz);
    block.delete((z - cz * this.chunkSize) * this.chunkSize + x - cx * this.chunkSize);
    if (block.size === 0) column.delete(cz);
    if (column.size === 0) this.blocks.delete(cx);
    this.mark(cx, cz);
    return true;
  }

  mark(x, z) {
    let column = this.versions.get(x);
    if (!column) this.versions.set(x, column = new Map());
    column.set(z, ++this.version);
    this.lastX = Number.NaN;
    this.lastBlock = null;
  }

  clear() {
    super.clear();
    this.blocks.clear();
    this.versions.clear();
    this.epoch = ++this.version;
    this.lastX = Number.NaN;
    this.lastBlock = null;
  }

  signature(minX, maxX, minZ, maxZ) {
    let version = this.epoch;
    this.forBlocks(minX, maxX, minZ, maxZ, (x, z) => {
      version = Math.max(version, this.versions.get(x)?.get(z) ?? 0);
    });
    return version;
  }

  forBlocks(minX, maxX, minZ, maxZ, visit) {
    const size = this.chunkSize;
    for (let z = Math.floor(minZ / size); z <= Math.floor(maxZ / size); z += 1) {
      for (let x = Math.floor(minX / size); x <= Math.floor(maxX / size); x += 1) visit(x, z);
    }
  }

  entriesInRect(minX, maxX, minZ, maxZ) {
    const result = [];
    const size = this.chunkSize;
    this.forBlocks(minX, maxX, minZ, maxZ, (cx, cz) => {
      for (const [index, value] of this.blocks.get(cx)?.get(cz) ?? []) {
        const x = cx * size + index % size;
        const z = cz * size + Math.floor(index / size);
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) result.push([x, z, value]);
      }
    });
    return result;
  }

  persistedEntriesInRect(minX, maxX, minZ, maxZ) {
    return this.entriesInRect(minX, maxX, minZ, maxZ).map(([x, z, value]) => [cellKey(x, z), value]);
  }
}
