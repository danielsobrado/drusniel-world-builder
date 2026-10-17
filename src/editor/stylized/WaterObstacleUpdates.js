import { bakeWaterObstacleField } from '../water/WaterObstacleField.js';
import { staticWaterAt } from '../water/StaticWaterSample.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

/** Consume already resident rock manifests. Never requests more residency. */
export class WaterObstacleUpdates {
  constructor(surface) { this.surface = surface; this.jobs = new Map(); this.active = null; }
  schedule() {
    const surface = this.surface, view = surface.rockView, store = view?.manifestStore;
    if (!store || surface.config.water.qualityTier === 'low' || surface.config.water.riverSurface?.obstacles === false) return;
    if (this.generator !== surface.terrainView.worldStore.generator) {
      this.generator = surface.terrainView.worldStore.generator; this.jobs.clear(); this.active = null;
      for (const slot of surface.waterSlots) slot.obstacleDescriptor = null;
    }
    for (const slot of surface.waterSlots) {
      if (!slot.hasWaterCoverage || !slot.hasRiverWater || !slot.isWithinRefractionRange()) { this.jobs.delete(slot); continue; }
      const descriptor = slot.terrainSlot.descriptor;
      if (slot.obstacleDescriptor === descriptor && slot.obstacleVersion === store.version) continue;
      slot.obstacleVersion = store.version;
      const entries = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        entries.push(view.placementsByChunk.get(`${descriptor.chunkX + dx}:${descriptor.chunkZ + dz}`));
      }
      const changed = slot.obstacleDescriptor !== descriptor || entries.some((entry, i) => entry !== slot.obstacleEntries?.[i]);
      slot.obstacleDescriptor = descriptor; slot.obstacleEntries = entries;
      if (changed) this.jobs.set(slot, { slot, descriptor, entries });
    }
    PerfCounters.set('waterObstaclePending', this.jobs.size + (this.active ? 1 : 0));
  }
  flush(shouldYield = () => false) {
    const started = performance.now(), surface = this.surface, view = surface.rockView;
    while (!shouldYield() && performance.now() - started < .65) {
      if (!this.active) {
        const next = this.jobs.values().next().value;
        if (!next) break;
        this.jobs.delete(next.slot);
        const { slot, descriptor, entries } = next;
        if (slot.terrainSlot.descriptor !== descriptor) continue;
        this.scratch ??= new Uint8Array(slot.waterObstaclePixels.length);
        this.active = { ...next, iterator: bakeWaterObstacleField({ pixels: this.scratch, size: slot.fieldSize,
          centerX: descriptor.centerWorldX, centerZ: descriptor.centerWorldZ, meters: surface.terrainView.chunkWorldSize,
          rocks: entries.flatMap(entry => entry ?? []), waterAt: (x, z) => staticWaterAt(surface.terrainView, x, z),
          rockHeight: rock => (view.prototypeHeights[rock.prototypeIndex] ?? 1) * rock.scale }) };
      }
      const job = this.active;
      if (job.slot.terrainSlot.descriptor !== job.descriptor) { this.active = null; continue; }
      if (job.iterator.next().done) {
        job.slot.waterObstaclePixels.set(this.scratch); job.slot.waterObstacleTexture.needsUpdate = true;
        PerfCounters.inc('waterObstacleUploadBytes', this.scratch.byteLength);
        PerfCounters.inc('textureBytesUploaded', this.scratch.byteLength);
        this.active = null;
      }
    }
    PerfCounters.set('waterObstaclePending', this.jobs.size + (this.active ? 1 : 0));
    PerfCounters.set('waterObstacleCpuMs', performance.now() - started);
  }
  get pending() { return this.jobs.size + (this.active ? 1 : 0); }
  dispose() { this.jobs.clear(); this.active = null; this.scratch = null; }
}
