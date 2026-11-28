/** Discard unfinished manifests outside the current canonical chunk window. */
export function retainPendingScatterWindow(pending, focus, radius) {
  for (const key of pending.keys()) {
    const [x, z] = key.split(':').map(Number);
    if (Math.abs(x - focus.chunkX) > radius || Math.abs(z - focus.chunkZ) > radius) pending.delete(key);
  }
}
