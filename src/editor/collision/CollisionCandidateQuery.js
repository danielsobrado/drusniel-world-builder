import { canonicalAabbsIntersect } from './colliders/ColliderBounds.js';

/** Use the smaller of the query's chunk rectangle and the resident chunk set. */
export function queryCollisionChunks(world, aabb, stamp, out, layers) {
  const size = world.chunkWorldSize;
  // Chunk bounds and collider intersection are inclusive at both edges. Include
  // the neighbor touching the minimum edge as well as the maximum edge.
  const minX = Math.ceil(aabb.minX / size) - 1;
  const maxX = Math.floor(aabb.maxX / size);
  const minZ = Math.ceil(-aabb.maxZ / size) - 1;
  const maxZ = Math.floor(-aabb.minZ / size);
  const columns = maxX - minX + 1;
  const rows = maxZ - minZ + 1;
  let queried = 0;
  if (Number.isSafeInteger(minX) && Number.isSafeInteger(maxX)
      && Number.isSafeInteger(minZ) && Number.isSafeInteger(maxZ)
      && columns > 0 && rows > 0 && columns * rows < world.chunks.size) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const chunk = world.chunks.get(`${x}:${z}`);
        if (!chunk || !canonicalAabbsIntersect(chunk.bounds, aabb)) continue;
        queried++;
        chunk.query(aabb, stamp, world.registry, out, layers);
      }
    }
  } else {
    // Teleports and enormous AABBs must remain bounded by residency, never by
    // the amount of empty world between their endpoints.
    for (const chunk of world.chunks.values()) {
      if (!canonicalAabbsIntersect(chunk.bounds, aabb)) continue;
      queried++;
      chunk.query(aabb, stamp, world.registry, out, layers);
    }
  }
  return queried;
}
