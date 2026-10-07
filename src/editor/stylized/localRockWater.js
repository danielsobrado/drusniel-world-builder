/** Resolve the local body once when the manifest is built, with no GPU field. */
export function rockWaterContact(placement, footprint, waterAt) {
  const reach = Math.max(0.4, footprint * placement.scale * 0.5 + 0.6);
  // Probe nearest first. Submerged rocks resolve at their centre without eight
  // redundant body queries; a dry bank keeps the complete footprint search.
  for (const [dx, dz] of [[0, 0],
    [reach * 0.7, reach * 0.7], [-reach * 0.7, reach * 0.7],
    [reach * 0.7, -reach * 0.7], [-reach * 0.7, -reach * 0.7],
    [reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
    const water = waterAt(placement.x + dx, placement.z + dz);
    if (!water?.kind || water.coverage < 0.5 || !Number.isFinite(water.surfaceHeight)) continue;
    return [water.surfaceHeight, 1, water.fall ?? 0];
  }
  return [0, 0, 0];
}
