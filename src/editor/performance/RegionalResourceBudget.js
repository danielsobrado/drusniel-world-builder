import { PerfCounters } from './qa/PerfCounters.js';
import { getTerrainMaterialBakeGpuState } from '../materials/TerrainMaterialBakeGpu.js';

const MIB = 1024 * 1024;

export function estimateRegionalTextureBytes(texture) {
  if (texture.mipmaps?.length && texture.mipmaps.every(mip => mip.data?.byteLength)) {
    return texture.mipmaps.reduce((sum, mip) => sum + mip.data.byteLength, 0);
  }
  const image = texture.image;
  const bytes = image?.data?.byteLength ?? ((image?.width ?? 0) * (image?.height ?? 0) * (image?.depth ?? 1) * 4);
  return Math.ceil(bytes * (texture.generateMipmaps ? 4 / 3 : 1));
}

/** Owned slot textures and regional atlases; active resources are never evicted. */
export class RegionalResourceBudget {
  constructor(settings) {
    this.settings = settings;
    this.idle = new WeakMap();
    this.nextSample = 0;
    this.trackedBytes = 0;
  }

  update(surface, now, shouldYield = () => false) {
    shouldYield ??= () => false;
    if (shouldYield()) return;
    const renderer = surface.terrainView.renderer;
    const manager = renderer?._textures;
    const info = renderer?.info;
    const settings = this.settings;
    let remaining = settings.evictionsPerFrame;
    if (now >= this.nextSample) {
      this.nextSample = now + settings.sampleIntervalMs;
      const candidates = new Map();
      const add = (textures, active) => {
        for (const texture of textures) if (texture) candidates.set(texture, active || candidates.get(texture) === true);
      };
      const pending = surface.terrainView.drawPreparation?.pending;
      for (const slot of surface.terrainView.slots) {
        add([slot.tileTexture, slot.surfaceMaskTexture, slot.heightTexture, slot.forestFloorTexture,
          ...Object.values(getTerrainMaterialBakeGpuState(slot.mesh)?.textures ?? {})],
        Boolean(slot.mesh.visible || slot.loading || pending?.has(slot.mesh)));
      }
      for (const slot of surface.waterSlots) {
        add([slot.waterFieldTexture, slot.waterFlowTexture, slot.waterAppearanceTexture, slot.waterObstacleTexture],
          Boolean(slot.hasWaterCoverage || slot.terrainSlot.loading || pending?.has(slot.mesh)));
      }
      let bytes = 0;
      const eligible = [];
      for (const [texture, active] of candidates) {
        if (!manager?.has?.(texture)) { this.idle.delete(texture); continue; }
        const accounted = info?.memoryMap?.get(texture);
        const size = Number.isFinite(accounted) && accounted > 0 ? accounted : estimateRegionalTextureBytes(texture);
        bytes += size;
        if (active) { this.idle.delete(texture); continue; }
        if (!this.idle.has(texture)) this.idle.set(texture, now);
        if (now - this.idle.get(texture) >= settings.idleMs) eligible.push({ texture, size, since: this.idle.get(texture) });
      }
      bytes += PerfCounters.get('treeImpostorAtlasBytes') + PerfCounters.get('terrainMaterialFamilyAtlasBytes');
      const total = info?.memory?.total;
      let rendererBytes = Number.isFinite(total) ? total : 0;
      eligible.sort((a, b) => a.since - b.since || b.size - a.size);
      for (const item of eligible) {
        if (remaining <= 0 || shouldYield() || (bytes <= settings.maxTrackedTextureMiB * MIB && rendererBytes <= settings.maxRendererMiB * MIB)) break;
        item.texture.dispose();
        this.idle.delete(item.texture);
        bytes -= item.size;
        rendererBytes = Math.max(0, rendererBytes - item.size);
        remaining--;
        PerfCounters.inc('regionalTextureEvictions');
        PerfCounters.inc('regionalTextureBytesEvicted', item.size);
      }
      this.trackedBytes = bytes;
      PerfCounters.set('regionalTrackedTextureBytes', bytes);
      PerfCounters.set('regionalRendererAccountedBytes', Number.isFinite(info?.memory?.total) ? info.memory.total : rendererBytes);
      PerfCounters.set('regionalRendererBudgetExceededBytes', Math.max(0, rendererBytes - settings.maxRendererMiB * MIB));
      PerfCounters.set('regionalRendererAccountingAvailable', Number.isFinite(total) ? 1 : 0);
      PerfCounters.set('regionalTextureBudgetExceededBytes', Math.max(0, bytes - settings.maxTrackedTextureMiB * MIB));
    }
    if (remaining > 0 && !shouldYield()) remaining -= surface.treeView?.retireRegionalPools(now, settings.idleMs, remaining) ?? 0;
    if (remaining > 0 && !shouldYield()) remaining -= surface.meadowGrass?.blades?.batches.retireIdle(now, settings.idleMs, remaining) ?? 0;
    if (remaining > 0 && !shouldYield()) remaining -= surface.meadowGrass?.cards?.batches.retireIdle(now, settings.idleMs, remaining) ?? 0;
    if (remaining > 0 && !shouldYield()) remaining -= surface.sharedWaterMaterials?.retireIdle?.(surface.waterSlots, now, settings.idleMs, remaining) ?? 0;
    if (remaining > 0 && !shouldYield()) remaining -= surface.terrainView.retireRegionalMaterials?.(now, settings.idleMs, remaining) ?? 0;
    PerfCounters.inc('regionalIdleResourceRetirements', settings.evictionsPerFrame - remaining);
  }
}
