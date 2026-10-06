import { cubicBezierPathBounds } from './curve/CubicBezierPath.js';

function key(x, z) {
  return `${x}:${z}`;
}

function validateBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    throw new Error('Construction bounds are required.');
  }
  for (const field of ['minX', 'minZ', 'maxX', 'maxZ']) {
    if (!Number.isFinite(bounds[field])) {
      throw new Error(`Construction bounds ${field} must be finite.`);
    }
  }
  if (bounds.maxX < bounds.minX || bounds.maxZ < bounds.minZ) {
    throw new Error('Construction bounds maximums must cover their minimums.');
  }
}

export class ConstructionSpatialIndex {
  constructor({ chunkWorldSize }) {
    if (!(chunkWorldSize > 0)) throw new Error('Construction chunk size must be positive.');
    this.chunkWorldSize = chunkWorldSize;
    this.byChunk = new Map();
    this.byConstruction = new Map();
    this.chunkRevisions = new Map();
    this.revision = 0;
  }

  keysForBounds(bounds, margin = 0) {
    validateBounds(bounds);
    if (!Number.isFinite(margin) || margin < 0) {
      throw new Error('Construction bounds margin must be non-negative.');
    }
    const minX = Math.floor((bounds.minX - margin) / this.chunkWorldSize);
    const maxX = Math.floor((bounds.maxX + margin) / this.chunkWorldSize);
    const minZ = Math.floor((bounds.minZ - margin) / this.chunkWorldSize);
    const maxZ = Math.floor((bounds.maxZ + margin) / this.chunkWorldSize);
    const result = [];
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) result.push(key(x, z));
    }
    return result;
  }

  signatureForBounds(bounds, margin = 0) {
    validateBounds(bounds);
    if (!Number.isFinite(margin) || margin < 0) {
      throw new Error('Construction bounds margin must be non-negative.');
    }
    const minX = Math.floor((bounds.minX - margin) / this.chunkWorldSize);
    const maxX = Math.floor((bounds.maxX + margin) / this.chunkWorldSize);
    const minZ = Math.floor((bounds.minZ - margin) / this.chunkWorldSize);
    const maxZ = Math.floor((bounds.maxZ + margin) / this.chunkWorldSize);
    let revision = 0;
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        revision = Math.max(revision, this.chunkRevisions.get(key(x, z)) ?? 0);
      }
    }
    return revision;
  }

  idsForBounds(bounds, margin = 0, target = new Set()) {
    validateBounds(bounds);
    if (!Number.isFinite(margin) || margin < 0) {
      throw new Error('Construction bounds margin must be non-negative.');
    }
    target.clear();
    const minX = Math.floor((bounds.minX - margin) / this.chunkWorldSize);
    const maxX = Math.floor((bounds.maxX + margin) / this.chunkWorldSize);
    const minZ = Math.floor((bounds.minZ - margin) / this.chunkWorldSize);
    const maxZ = Math.floor((bounds.maxZ + margin) / this.chunkWorldSize);
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        for (const id of this.byChunk.get(key(x, z)) ?? []) target.add(id);
      }
    }
    return target;
  }

  keysFor(record) {
    if (record.path.type !== 'cubicBezier') {
      throw new Error('Construction spatial indexing currently requires a cubic Bézier path.');
    }
    return this.keysForBounds(
      cubicBezierPathBounds(record.path),
      record.dimensions.thickness / 2,
    );
  }

  mark(keys) {
    const unique = new Set(keys);
    if (unique.size === 0) return;
    this.revision += 1;
    for (const chunkKey of unique) this.chunkRevisions.set(chunkKey, this.revision);
  }

  replaceKeys(constructionId, keys) {
    const id = String(constructionId);
    const previous = this.byConstruction.get(id) ?? new Set();
    for (const chunkKey of previous) {
      const ids = this.byChunk.get(chunkKey);
      ids?.delete(id);
      if (ids?.size === 0) this.byChunk.delete(chunkKey);
    }

    const next = new Set(keys);
    this.byConstruction.set(id, next);
    for (const chunkKey of next) {
      const ids = this.byChunk.get(chunkKey) ?? new Set();
      ids.add(id);
      this.byChunk.set(chunkKey, ids);
    }
    this.mark([...previous, ...next]);
    return Object.freeze([...next]);
  }

  update(record) {
    return this.replaceKeys(record.id, this.keysFor(record));
  }

  updateBounds(constructionId, bounds, margin = 0) {
    return this.replaceKeys(constructionId, this.keysForBounds(bounds, margin));
  }

  remove(constructionId) {
    const id = String(constructionId);
    const keys = this.byConstruction.get(id);
    if (!keys) return Object.freeze([]);
    for (const chunkKey of keys) {
      const ids = this.byChunk.get(chunkKey);
      ids?.delete(id);
      if (ids?.size === 0) this.byChunk.delete(chunkKey);
    }
    this.byConstruction.delete(id);
    this.mark(keys);
    return Object.freeze([...keys]);
  }

  list(chunkX, chunkZ) {
    return [...(this.byChunk.get(key(chunkX, chunkZ)) ?? [])].sort();
  }

  signature(chunkX, chunkZ) {
    return this.chunkRevisions.get(key(chunkX, chunkZ)) ?? 0;
  }

  clear() {
    const keys = [...this.byChunk.keys()];
    this.byChunk.clear();
    this.byConstruction.clear();
    this.mark(keys);
  }
}
