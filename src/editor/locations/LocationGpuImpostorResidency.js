import { AttributeType } from 'three/src/renderers/common/Constants.js';

const STORAGE_NAMES = ['transformBuffer', 'parameterBuffer', 'appearanceBuffer', 'visibleBuffer', 'planeBuffer'];

function distanceToBatch(batch, anchor) {
  if (batch.recordCount === 0) return Infinity;
  const b = batch.surfaceBounds;
  if (!b || ![b.minX, b.minZ, b.maxX, b.maxZ].every(Number.isFinite)
      || b.minX > b.maxX || b.minZ > b.maxZ) return 0;
  return Math.hypot(Math.max(0, b.minX - anchor.x, anchor.x - b.maxX),
    Math.max(0, b.minZ - anchor.z, anchor.z - b.maxZ));
}

/** Only known impostor input and regenerable output allocations qualify. */
export function collectLocationGpuImpostorAttributes(surface, renderer, anchor, settings) {
  const manager = renderer._attributes, backend = renderer.backend;
  if (!settings.surfaceGpuImpostorReclamationEnabled || typeof renderer.compute !== 'function'
      || !manager?.has || !manager?.delete || !manager?.update || !backend?.getBufferAttribute) return [];
  const tree = surface.treeView, pending = surface.terrainView.drawPreparation?.pending;
  const entries = [];
  for (const owner of tree?.impostorBatches ?? []) {
    if (owner?.mode !== 'gpu') continue;
    const batch = owner.batch;
    if (!batch?.mesh?.parent || batch.disposed || typeof batch.invalidateSurfaceCull !== 'function'
        || batch.renderer !== renderer) continue;
    const distance = distanceToBatch(batch, anchor);
    const blocked = tree.stagedRebuild || tree.pendingLodRebuild || batch.computePending || pending?.has(batch.mesh);
    for (const name of [...STORAGE_NAMES, 'drawBuffer']) {
      const attribute = batch[name], indirect = name === 'drawBuffer';
      if (!attribute?.isStorageBufferAttribute || Boolean(attribute.isIndirectStorageBufferAttribute) !== indirect
          || attribute.isInterleavedBufferAttribute || attribute.normalized
          || backend.getBufferAttribute(attribute) !== attribute) continue;
      if (indirect ? !(attribute.array instanceof Uint32Array) || attribute.itemSize !== 5 || attribute.array.length !== 5
        : name === 'visibleBuffer' ? !(attribute.array instanceof Uint32Array) || attribute.itemSize !== 1
          : !(attribute.array instanceof Float32Array) || attribute.itemSize !== 4) continue;
      const size = attribute.array.byteLength;
      if (!size || size > settings.surfaceRestoreBytesPerFrame) continue;
      entries.push({ resource: attribute, kind: 'impostor', owner: batch,
        attributeType: indirect ? AttributeType.INDIRECT : AttributeType.STORAGE,
        size, distance, protected: Boolean(blocked || distance <= settings.surfaceSceneryProtectMeters) });
    }
  }
  return entries;
}
