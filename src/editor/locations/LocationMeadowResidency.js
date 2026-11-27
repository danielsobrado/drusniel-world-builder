const INSTANCE_NAMES = ['instancePosition', 'instanceRotation', 'instanceData', 'instanceTile'];

/** Only page-owned CPU-authoritative attributes, never shared blade templates. */
export function collectLocationMeadowAttributes(surface, renderer, anchor, settings) {
  const manager = renderer._attributes, backend = renderer.backend;
  if (!settings.surfaceMeadowReclamationEnabled || !manager?.has || !manager?.delete
      || !manager?.update || !backend?.getBufferAttribute) return [];
  const preparation = surface.terrainView.drawPreparation;
  const entries = [];
  for (const layer of [surface.meadowGrass?.blades, surface.meadowGrass?.cards]) {
    if (!layer?.batches || !Number.isFinite(layer.tileSize) || layer.tileSize <= 0) continue;
    for (const meshPage of layer.batches.surfaceResidencyPages()) {
      const { mesh, geometry, pending, order } = meshPage;
      if (!mesh.parent || !geometry?.isInstancedBufferGeometry || geometry.indirect
          || pending || preparation?.pending?.has(mesh)) continue;
      let distance = Infinity, valid = true;
      const half = layer.tileSize / 2;
      if (geometry.instanceCount > 0 && !order.length) continue;
      for (const tile of order) {
        if (!Number.isFinite(tile.centerX) || !Number.isFinite(tile.centerZ)) { valid = false; break; }
        distance = Math.min(distance, Math.hypot(Math.max(0, Math.abs(tile.centerX - anchor.x) - half),
          Math.max(0, Math.abs(tile.centerZ - anchor.z) - half)));
      }
      if (!valid) continue;
      for (const name of INSTANCE_NAMES) {
        const attribute = geometry.getAttribute(name);
        if (!attribute?.isInstancedBufferAttribute || attribute.isStorageBufferAttribute
            || attribute.isStorageInstancedBufferAttribute || attribute.isInterleavedBufferAttribute
            || attribute.normalized || attribute.meshPerAttribute !== 1
            || !(attribute.array instanceof Float32Array) || ![2, 4].includes(attribute.itemSize)
            || backend.getBufferAttribute(attribute) !== attribute) continue;
        const size = attribute.array.byteLength;
        if (!size || size > settings.surfaceRestoreBytesPerFrame) continue;
        entries.push({ resource: attribute, kind: 'meadow', size, distance,
          protected: distance <= settings.surfaceMeadowProtectMeters });
      }
    }
  }
  return entries;
}
