import { REVISION } from 'three/webgpu';
import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { collectLocationGpuImpostorAttributes } from './LocationGpuImpostorResidency.js';
import { collectLocationSceneryAttributes } from './LocationSceneryResidency.js';
import { collectLocationMeadowAttributes } from './LocationMeadowResidency.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

const TERRAIN_TEXTURES = ['tileTexture', 'surfaceMaskTexture', 'heightTexture', 'forestFloorTexture'];
const WATER_TEXTURES = ['waterFieldTexture', 'waterFlowTexture', 'waterAppearanceTexture', 'waterObstacleTexture'];
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

function bytes(texture) {
  const image = texture?.image;
  if (!texture?.isDataTexture || texture.isRenderTargetTexture || texture.isStorageTexture
      || texture.generateMipmaps || texture.mipmaps?.length || !ArrayBuffer.isView(image?.data)
      || !image.data.byteLength || !(image.width > 0 && image.height > 0)) return 0;
  return image.data.byteLength;
}

/** Retire reversible CPU-backed surface allocations while the world is suspended. */
export class LocationSurfaceResidency {
  constructor(surface, renderer, settings, pause = nextFrame) {
    Object.assign(this, { surface, renderer, settings, pause });
    this.enabled = REVISION === '187' && renderer?.backend?.isWebGPUBackend === true
      && typeof renderer._textures?.has === 'function' && typeof renderer.initTexture === 'function';
    this.evicted = new Map();
    this.candidates = [];
    this.anchor = null;
    this.phase = 'idle';
    this.nextSample = 0;
    this.evictedBytes = 0;
  }

  collect(anchor) {
    const candidates = new Map();
    const add = (slot, keys, descriptor, protectedSlot) => {
      const half = Math.max(0, this.surface.terrainView.chunkWorldSize ?? 0) / 2;
      const distance = descriptor ? Math.hypot(Math.max(0, Math.abs(descriptor.centerWorldX - anchor.x) - half),
        Math.max(0, Math.abs(descriptor.centerWorldZ - anchor.z) - half)) : Infinity;
      const protect = protectedSlot || (descriptor && !Number.isFinite(distance)) || distance <= this.settings.surfaceProtectMeters;
      for (const key of keys) {
        const texture = slot[key], size = bytes(texture);
        if (!size || size > this.settings.surfaceRestoreBytesPerFrame) continue;
        const previous = candidates.get(texture);
        if (previous) {
          previous.protected ||= Boolean(protect);
          previous.distance = Math.min(previous.distance, distance);
        } else candidates.set(texture, { resource: texture, kind: 'texture', size, distance, protected: Boolean(protect) });
      }
    };
    const pending = this.surface.terrainView.drawPreparation?.pending;
    for (const slot of this.surface.terrainView.slots) {
      add(slot, TERRAIN_TEXTURES, slot.descriptor, slot.loading || pending?.has(slot.mesh));
    }
    for (const slot of this.surface.waterSlots) {
      add(slot, WATER_TEXTURES, slot.terrainSlot.descriptor, slot.terrainSlot.loading || pending?.has(slot.mesh));
    }
    for (const entry of [...collectLocationMeadowAttributes(this.surface, this.renderer, anchor, this.settings),
      ...collectLocationSceneryAttributes(this.surface, this.renderer, anchor, this.settings),
      ...collectLocationGpuImpostorAttributes(this.surface, this.renderer, anchor, this.settings)]) {
      const previous = candidates.get(entry.resource);
      if (previous) {
        previous.protected ||= entry.protected;
        previous.distance = Math.min(previous.distance, entry.distance);
      } else candidates.set(entry.resource, entry);
    }
    return [...candidates.values()];
  }

  resident(entry) {
    return entry.kind !== 'texture' ? this.renderer._attributes.has(entry.resource) : this.renderer._textures.has(entry.resource);
  }

  retire(entry) {
    if (entry.kind === 'impostor') entry.owner.invalidateSurfaceCull();
    if (entry.kind !== 'texture') this.renderer._attributes.delete(entry.resource);
    else entry.resource.dispose();
  }

  warm(entry) {
    const resource = entry.resource;
    if (entry.kind !== 'texture') {
      this.renderer._attributes.update(resource, entry.attributeType ?? AttributeType.VERTEX);
      resource.clearUpdateRanges();
    } else {
      resource.needsUpdate = true;
      this.renderer.initTexture(resource);
    }
  }

  begin(anchor, now = performance.now()) {
    if (!this.enabled || this.phase !== 'idle' || !Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.z)) return;
    this.anchor = { x: anchor.x, z: anchor.z };
    this.phase = 'inside';
    this.nextSample = now + this.settings.surfaceIdleMs;
  }

  update(now = performance.now()) {
    if (this.phase !== 'inside' || this.renderer._isDeviceLost || now < this.nextSample) return;
    this.nextSample = now + this.settings.surfaceSampleMs;
    try {
      this.candidates = this.collect(this.anchor).filter(entry => !entry.protected
        && !this.evicted.has(entry.resource) && this.resident(entry));
      this.candidates.sort((a, b) => b.distance - a.distance || b.size - a.size);
      let remaining = this.settings.surfaceEvictionsPerSample;
      for (const entry of this.candidates) {
        if (remaining <= 0) break;
        if (this.evictedBytes + entry.size > this.settings.surfaceMaxEvictedBytes) continue;
        remaining--;
        this.retire(entry);
        if (this.resident(entry)) continue;
        this.evicted.set(entry.resource, entry);
        if (entry.kind !== 'texture') {
          PerfCounters.inc(`locationSurface.${entry.kind}Evictions`);
          PerfCounters.inc(`locationSurface.${entry.kind}EvictedBytes`, entry.size);
        }
        this.evictedBytes += entry.size;
        PerfCounters.inc('locationSurface.evictions');
        PerfCounters.inc('locationSurface.evictedBytes', entry.size);
      }
    } catch (error) {
      this.phase = 'paused';
      console.warn('Surface resource reclamation paused.', error);
    } finally {
      this.candidates.length = 0;
      this.publish();
    }
  }

  publish() {
    let textures = 0, meadow = 0, scenery = 0, impostor = 0;
    for (const entry of this.evicted.values()) {
      if (entry.kind === 'meadow') meadow++;
      else if (entry.kind === 'scenery') scenery++;
      else if (entry.kind === 'impostor') impostor++;
      else textures++;
    }
    PerfCounters.set('locationSurface.pendingTextures', textures);
    PerfCounters.set('locationSurface.pendingMeadowAttributes', meadow);
    PerfCounters.set('locationSurface.pendingSceneryAttributes', scenery);
    PerfCounters.set('locationSurface.pendingImpostorAttributes', impostor);
    PerfCounters.set('locationSurface.pendingBytes', this.evictedBytes);
  }

  async restore(signal) {
    if (this.phase === 'idle' || this.phase === 'disposed') return;
    this.phase = 'restoring';
    try {
      let current = new Map(this.collect(this.anchor).map(entry => [entry.resource, entry]));
      const entries = [...this.evicted.values()].sort((a, b) => a.distance - b.distance);
      let count = 0, uploaded = 0;
      for (const entry of entries) {
        signal?.throwIfAborted();
        if (this.phase !== 'restoring' || this.renderer._isDeviceLost) break;
        let live = current.get(entry.resource);
        if (live && !this.resident(live)) {
          if (count >= this.settings.surfaceRestoresPerFrame || uploaded + live.size > this.settings.surfaceRestoreBytesPerFrame) {
            await this.pause();
            signal?.throwIfAborted();
            if (this.phase !== 'restoring' || this.renderer._isDeviceLost) break;
            count = 0;
            uploaded = 0;
            current = new Map(this.collect(this.anchor).map(item => [item.resource, item]));
            live = current.get(entry.resource);
          }
          if (live && !this.resident(live)) {
            this.warm(live);
            count++;
            uploaded += live.size;
            PerfCounters.inc('locationSurface.restoredBytes', live.size);
            PerfCounters.inc('locationSurface.restores');
            if (live.kind !== 'texture') {
              PerfCounters.inc(`locationSurface.${live.kind}Restores`);
              PerfCounters.inc(`locationSurface.${live.kind}RestoredBytes`, live.size);
            }
          }
        }
        this.evicted.delete(entry.resource);
        this.evictedBytes -= entry.size;
        this.publish();
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      PerfCounters.inc('locationSurface.restoreFailures');
      console.warn('Surface resource warmup unavailable; using normal renderer upload.', error);
    } finally {
      if (this.phase !== 'disposed') this.reset();
    }
  }

  reset() {
    this.evicted.clear();
    this.evictedBytes = 0;
    this.anchor = null;
    this.phase = 'idle';
    this.publish();
  }

  dispose() {
    this.reset();
    this.phase = 'disposed';
    this.enabled = false;
  }
}
