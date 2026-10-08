import { parseCollisionChunkKey } from '../CollisionIds.js';
import { COLLISION_LAYERS } from '../CollisionLayers.js';
import { COLLIDER_TYPE_BOX, createPrimitiveCollider } from '../colliders/ColliderRecords.js';

const TOWN_COLLISION_SCHEMA = 'towns:v1';

/** Canonical AABB of an upright box turned by yaw about +Y. */
export function townBoxAabb(box) {
  const cos = Math.abs(Math.cos(box.yaw));
  const sin = Math.abs(Math.sin(box.yaw));
  const halfX = (box.sx * cos + box.sz * sin) / 2;
  const halfZ = (box.sx * sin + box.sz * cos) / 2;
  return {
    minX: box.x - halfX,
    minY: box.y - box.sy / 2,
    minZ: box.z - halfZ,
    maxX: box.x + halfX,
    maxY: box.y + box.sy / 2,
    maxZ: box.z + halfZ,
  };
}

export function townBoxCollider(box, chunkX, chunkZ) {
  return createPrimitiveCollider({
    sourceId: box.id,
    type: COLLIDER_TYPE_BOX,
    // Walls, floors and stair treads are all both blocking and standable.
    layers: COLLISION_LAYERS.solid,
    ownerChunkX: chunkX,
    ownerChunkZ: chunkZ,
    aabb: townBoxAabb(box),
    position: [box.x, box.y, box.z],
    rotationY: box.yaw + 0,
    dimensions: [box.sx, box.sy, box.sz],
    prototypeId: 'town-box',
  });
}

/** Feeds streamed town boxes (TownCollisionSource) to the collision runtime. */
export class TownCollisionProvider {
  constructor({ source, chunkWorldSize }) {
    if (!source?.configure || !source?.list || !source?.signature) {
      throw new Error('Town collision provider requires a town collision source.');
    }
    this.source = source.configure(chunkWorldSize);
    this.observed = new Map();
    this.descriptor = Object.freeze({ id: 'towns' });
  }

  getEpoch() {
    return TOWN_COLLISION_SCHEMA;
  }

  getProfileCount() {
    return this.source.getBoxCount();
  }

  consumeDirtyOwnerChunks(activeKeys) {
    const dirty = [];
    for (const key of activeKeys ?? []) {
      const { chunkX, chunkZ } = parseCollisionChunkKey(key);
      if (this.observed.get(key) !== this.source.signature(chunkX, chunkZ)) dirty.push(key);
    }
    return Object.freeze(dirty);
  }

  buildChunkData(chunkX, chunkZ) {
    const boxes = this.source.list(chunkX, chunkZ);
    const colliders = boxes
      .map((box) => townBoxCollider(box, chunkX, chunkZ))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
    const revision = this.source.signature(chunkX, chunkZ);
    this.observed.set(`${chunkX}:${chunkZ}`, revision);
    return Object.freeze({
      signature: `${TOWN_COLLISION_SCHEMA}|${revision}|${colliders.length}`,
      colliders: Object.freeze(colliders),
      stats: Object.freeze({ colliders: colliders.length }),
      sample: null,
    });
  }

  getStatus() {
    return Object.freeze({ id: this.descriptor.id, boxes: this.getProfileCount() });
  }

  dispose() {
    this.observed.clear();
  }
}
