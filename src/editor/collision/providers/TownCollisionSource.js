import { collisionChunkKey } from '../CollisionIds.js';
import { collisionChunkForCanonical } from '../colliders/ColliderBounds.js';

/**
 * Collision boxes for streamed towns (src/editor/towns), keyed by owner chunk.
 *
 * Towns are built on the main thread as the player approaches; each pushes its
 * boxes here under its own owner id and withdraws them when it unloads. A box is
 * an upright box with a yaw, in canonical metres: { id, x, y, z, sx, sy, sz, yaw }
 * where (x, y, z) is the centre. Every change bumps the revision of the chunks it
 * touches, which is what the provider's dirty-chunk check reads — so opening one
 * door rebuilds one collision chunk.
 */
export class TownCollisionSource {
  constructor() {
    this.chunkWorldSize = null;
    this.owners = new Map();
    this.chunks = new Map();
    this.revisions = new Map();
    this.revision = 0;
  }

  configure(chunkWorldSize) {
    if (!(chunkWorldSize > 0)) throw new Error('Town collision source requires a chunk size.');
    if (this.chunkWorldSize !== chunkWorldSize) {
      this.chunkWorldSize = chunkWorldSize;
      const owners = [...this.owners.entries()];
      this.owners.clear();
      this.chunks.clear();
      for (const [ownerId, boxes] of owners) this.setOwner(ownerId, boxes);
    }
    return this;
  }

  keyFor(box) {
    const { chunkX, chunkZ } = collisionChunkForCanonical(box.x, box.z, this.chunkWorldSize);
    return collisionChunkKey(chunkX, chunkZ);
  }

  touch(key) {
    this.revision += 1;
    this.revisions.set(key, this.revision);
  }

  /** Replace every box an owner (one town) contributes. */
  setOwner(ownerId, boxes) {
    this.removeOwner(ownerId);
    const list = [...boxes];
    this.owners.set(ownerId, list);
    if (!this.chunkWorldSize) return;
    for (const box of list) {
      const key = this.keyFor(box);
      if (!this.chunks.has(key)) this.chunks.set(key, new Map());
      this.chunks.get(key).set(box.id, box);
      this.touch(key);
    }
  }

  removeOwner(ownerId) {
    const boxes = this.owners.get(ownerId);
    if (!boxes) return;
    this.owners.delete(ownerId);
    if (!this.chunkWorldSize) return;
    for (const box of boxes) {
      const key = this.keyFor(box);
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      chunk.delete(box.id);
      if (chunk.size === 0) this.chunks.delete(key);
      this.touch(key);
    }
  }

  /** Add or remove one box of an owner, e.g. a door closing or opening. */
  setBoxEnabled(ownerId, box, enabled) {
    const boxes = this.owners.get(ownerId);
    if (!boxes || !this.chunkWorldSize) return;
    const key = this.keyFor(box);
    if (!this.chunks.has(key)) this.chunks.set(key, new Map());
    const chunk = this.chunks.get(key);
    if (enabled === chunk.has(box.id)) return;
    if (enabled) chunk.set(box.id, box);
    else chunk.delete(box.id);
    this.touch(key);
  }

  list(chunkX, chunkZ) {
    const chunk = this.chunks.get(collisionChunkKey(chunkX, chunkZ));
    return chunk ? [...chunk.values()] : [];
  }

  signature(chunkX, chunkZ) {
    return this.revisions.get(collisionChunkKey(chunkX, chunkZ)) ?? 0;
  }

  getBoxCount() {
    let count = 0;
    for (const chunk of this.chunks.values()) count += chunk.size;
    return count;
  }

  clear() {
    for (const ownerId of [...this.owners.keys()]) this.removeOwner(ownerId);
  }
}

export const townCollisionSource = new TownCollisionSource();
