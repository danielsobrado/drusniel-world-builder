/** Query chunk-sized rectangles; distant slots must never create a query across the gap. */
export function residentObjectQueries(slots, chunkSize) {
  if (!Array.isArray(slots) || !Number.isSafeInteger(chunkSize) || chunkSize < 1) return [];
  const descriptors = new Map();
  for (const slot of slots) {
    const d = slot?.descriptor;
    if (!d || !Number.isSafeInteger(d.originCellX) || !Number.isSafeInteger(d.originCellZ)) continue;
    descriptors.set(`${d.originCellX}:${d.originCellZ}`, d);
  }
  return [...descriptors.values()].sort((a, b) => a.originCellZ - b.originCellZ || a.originCellX - b.originCellX)
    .map(d => ({ minX: d.originCellX, minZ: d.originCellZ,
      maxX: d.originCellX + chunkSize - 1, maxZ: d.originCellZ + chunkSize - 1 }));
}

export function residentDescriptorSignature(slots) {
  if (!Array.isArray(slots)) return 'finite';
  return [...new Set(slots.flatMap(s => s?.descriptor
    ? [`${s.descriptor.originCellX}:${s.descriptor.originCellZ}`] : []))].sort().join('|');
}

export function collectResidentObjects({ slots, chunkSize, objectMap, selectedObjectId }) {
  if (!Array.isArray(slots)) return objectMap.list();
  const byId = new Map();
  for (const bounds of residentObjectQueries(slots, chunkSize)) {
    for (const object of objectMap.queryBounds(bounds)) byId.set(object.id, object);
  }
  if (selectedObjectId != null) {
    const selected = objectMap.getById(selectedObjectId);
    if (selected) byId.set(selected.id, selected);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
