import { collisionChunkKey } from '../CollisionIds.js';
import { collisionChunkForCanonical } from '../colliders/ColliderBounds.js';
import { drainJob } from '../../world/settlements/SettlementArrayJobs.js';

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
    drainJob(this.setOwnerJob(ownerId, boxes));
  }

  *setOwnerJob(ownerId, boxes) {
    const list = [...boxes];
    if (!this.chunkWorldSize) { this.owners.set(ownerId, list); return; }
    retry: for (;;) {
      const revision = this.revision;
      const size = this.chunkWorldSize;
      const staged = new Map();
      let steps = 0;
      const affected = new Set();
      for (const box of [...(this.owners.get(ownerId) ?? []), ...list]) {
        affected.add(this.keyFor(box));
        if (++steps % 64 === 0) { yield; if (size !== this.chunkWorldSize) continue retry; }
      }
      for (const key of affected) {
        const chunk = new Map(); staged.set(key, chunk);
        for (const [id, box] of this.chunks.get(key) ?? []) {
          chunk.set(id, box);
          if (++steps % 64 === 0) { yield; if (size !== this.chunkWorldSize) continue retry; }
        }
      }
      for (const box of this.owners.get(ownerId) ?? []) {
        staged.get(this.keyFor(box))?.delete(box.id);
        if (++steps % 64 === 0) { yield; if (size !== this.chunkWorldSize) continue retry; }
      }
      for (const box of list) {
        staged.get(this.keyFor(box)).set(box.id, box);
        if (++steps % 64 === 0) { yield; if (size !== this.chunkWorldSize) continue retry; }
      }
      // Doors or another town may have changed a shared chunk while we yielded.
      if (revision !== this.revision || size !== this.chunkWorldSize) continue;
      this.owners.set(ownerId, list);
      for (const [key, chunk] of staged) {
        if (chunk.size) this.chunks.set(key, chunk);
        else this.chunks.delete(key);
        this.touch(key);
      }
      return;
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
