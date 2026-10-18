import { residentDescriptorSignature, residentObjectQueries } from '../world/residentObjectQueries.js';
const caches = new WeakMap();
/** Slot objects survive streaming; descriptor identity tells us when to re-key. */
export function objectResidencyState(view) {
  let cache = caches.get(view);
  const slots = view.terrainView.slots;
  let changed = !cache || (slots?.length ?? 0) !== cache.descriptors.length;
  if (!changed && Array.isArray(slots)) {
    for (let i = 0; i < slots.length; i++) if (slots[i]?.descriptor !== cache.descriptors[i]) { changed = true; break; }
  }
  if (changed) {
    const descriptors = Array.isArray(slots) ? slots.map(slot => slot?.descriptor) : [];
    cache = { descriptors, key: residentDescriptorSignature(slots),
      queries: residentObjectQueries(slots, view.terrainView.worldStore?.chunkSize), revision: NaN };
    caches.set(view, cache);
  }
  if (cache.revision !== view.objectMap.revision || cache.selection !== view.selectedObjectId) {
    cache.revision = view.objectMap.revision;
    cache.selection = view.selectedObjectId;
    const local = view.objectMap.signatureForBounds && Array.isArray(slots)
      ? cache.queries.map(bounds => view.objectMap.signatureForBounds(bounds)).join(':') : cache.revision;
    const selected = view.selectedObjectId == null ? null : view.objectMap.getById(view.selectedObjectId);
    cache.objects = `${local}|${JSON.stringify(selected)}`;
  }
  return cache;
}

export function invalidateObjectPlacements(view, change) {
  if (change.kind === 'reset') { view.allPlacementsDirty = true; return; }
  if (!['height', 'tile', 'water'].includes(change.kind)) return;
  for (const point of change.vertices ?? change.cells ?? []) {
    const bounds = { minX: point.x - 1, maxX: point.x + 1, minZ: point.z - 1, maxZ: point.z + 1 };
    for (const object of view.objectMap.queryBounds(bounds)) view.dirtyPlacements.add(object.id);
  }
}
