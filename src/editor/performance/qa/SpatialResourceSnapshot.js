import { getTerrainMaterialBakeGpuState } from '../../materials/TerrainMaterialBakeGpu.js';
import { estimateRegionalTextureBytes } from '../RegionalResourceBudget.js';

function materialState(mesh, desired = null) {
  const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
  return {
    visible: mesh?.visible === true,
    materials: materials.filter(Boolean).map(material => material.name || material.type || 'unnamed'),
    pendingMaterial: Boolean(desired && mesh?.material !== desired),
  };
}

/** Assigned slot textures only. Never attribute shared atlases or CPU-side scenery buffers to a chunk. */
export function spatialResourceSnapshot(surface, now, bakeState = getTerrainMaterialBakeGpuState) {
  const view = surface.terrainView;
  const renderer = view.renderer;
  const cells = new Map(), owners = new Map();
  const add = (slot, kind, textures, state) => {
    const descriptor = slot?.descriptor;
    if (!descriptor || !Number.isInteger(descriptor.chunkX) || !Number.isInteger(descriptor.chunkZ)) return;
    const key = `${descriptor.chunkX}:${descriptor.chunkZ}`;
    let cell = cells.get(key);
    if (!cell) cells.set(key, cell = { key, terrain: null, water: null,
      accountedTextureBytes: 0, estimatedTextureBytes: 0, unknownTextures: 0, sharedTextures: 0, unallocatedTextures: 0 });
    cell[kind] = state;
    for (const texture of textures) {
      if (!texture) continue;
      let keys = owners.get(texture);
      if (!keys) owners.set(texture, keys = new Set());
      keys.add(key);
    }
  };
  for (const slot of view.slots ?? []) add(slot, 'terrain', [
    slot.tileTexture, slot.surfaceMaskTexture, slot.heightTexture, slot.forestFloorTexture,
    ...Object.values(bakeState(slot.mesh)?.textures ?? {}),
  ], { ...materialState(slot.mesh, slot.desiredMaterial), loading: Boolean(slot.loading), retryPending: slot.retryAt != null,
    pageRevision: slot.pageRevision ?? null });
  for (const slot of surface.waterSlots ?? []) add(slot.terrainSlot, 'water', [
    slot.waterFieldTexture, slot.waterFlowTexture, slot.waterAppearanceTexture, slot.waterObstacleTexture,
  ], { ...materialState(slot.mesh), wet: Boolean(slot.hasWaterCoverage) });
  let sharedTextures = 0;
  for (const [texture, keys] of owners) {
    if (keys.size !== 1) {
      sharedTextures++;
      for (const key of keys) cells.get(key).sharedTextures++;
      continue;
    }
    const cell = cells.get(keys.values().next().value);
    const bytes = renderer?.info?.memoryMap?.get?.(texture);
    if (Number.isFinite(bytes) && bytes > 0) cell.accountedTextureBytes += bytes;
    else if (renderer?._textures?.has?.(texture) === false) cell.unallocatedTextures++;
    else if (renderer?._textures?.has?.(texture) === true) {
      const estimated = estimateRegionalTextureBytes(texture);
      if (estimated > 0) cell.estimatedTextureBytes += estimated;
      else cell.unknownTextures++;
    } else cell.unknownTextures++;
  }
  return { timestamp: now, cells, sharedTextures };
}

export function spatialResourceBytes(resource) {
  if (!resource) return null;
  const bytes = resource.accountedTextureBytes + resource.estimatedTextureBytes;
  return bytes === 0 && (resource.unknownTextures || resource.sharedTextures) ? null : bytes;
}
