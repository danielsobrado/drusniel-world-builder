import { REVISION } from 'three/webgpu';
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

/** Retire only reversible slot-owned texture allocations while the world is suspended. */
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
        } else candidates.set(texture, { texture, size, distance, protected: Boolean(protect) });
      }
    };
    const pending = this.surface.terrainView.drawPreparation?.pending;
    for (const slot of this.surface.terrainView.slots) {
      add(slot, TERRAIN_TEXTURES, slot.descriptor, slot.loading || pending?.has(slot.mesh));
    }
    for (const slot of this.surface.waterSlots) {
      add(slot, WATER_TEXTURES, slot.terrainSlot.descriptor, slot.terrainSlot.loading || pending?.has(slot.mesh));
    }
    return [...candidates.values()];
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
        && !this.evicted.has(entry.texture) && this.renderer._textures.has(entry.texture));
      this.candidates.sort((a, b) => b.distance - a.distance || b.size - a.size);
      let remaining = this.settings.surfaceEvictionsPerSample;
      for (const entry of this.candidates) {
        if (remaining <= 0) break;
        if (this.evictedBytes + entry.size > this.settings.surfaceMaxEvictedBytes) continue;
        remaining--;
        entry.texture.dispose();
        if (this.renderer._textures.has(entry.texture)) continue;
        this.evicted.set(entry.texture, entry);
        this.evictedBytes += entry.size;
        PerfCounters.inc('locationSurface.evictions');
        PerfCounters.inc('locationSurface.evictedBytes', entry.size);
      }
    } catch (error) {
      this.phase = 'paused';
      console.warn('Surface texture reclamation paused.', error);
    } finally {
      this.candidates.length = 0;
      this.publish();
    }
  }

  publish() {
    PerfCounters.set('locationSurface.pendingTextures', this.evicted.size);
    PerfCounters.set('locationSurface.pendingBytes', this.evictedBytes);
  }

  async restore(signal) {
    if (this.phase === 'idle' || this.phase === 'disposed') return;
    this.phase = 'restoring';
    try {
      const current = new Map(this.collect(this.anchor).map(entry => [entry.texture, entry]));
      const entries = [...this.evicted.values()].sort((a, b) => a.distance - b.distance);
      let count = 0, uploaded = 0;
      for (const entry of entries) {
        signal?.throwIfAborted();
        if (this.phase !== 'restoring' || this.renderer._isDeviceLost) break;
        const texture = entry.texture, live = current.get(texture);
        const size = bytes(texture);
        if (live && size > 0 && size <= this.settings.surfaceRestoreBytesPerFrame && !this.renderer._textures.has(texture)) {
          if (count >= this.settings.surfaceRestoresPerFrame || uploaded + size > this.settings.surfaceRestoreBytesPerFrame) {
            await this.pause();
            signal?.throwIfAborted();
            if (this.phase !== 'restoring' || this.renderer._isDeviceLost) break;
            count = 0;
            uploaded = 0;
          }
          texture.needsUpdate = true;
          this.renderer.initTexture(texture);
          count++;
          uploaded += size;
          PerfCounters.inc('locationSurface.restoredBytes', size);
          PerfCounters.inc('locationSurface.restores');
        }
        this.evicted.delete(texture);
        this.evictedBytes -= entry.size;
        this.publish();
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      PerfCounters.inc('locationSurface.restoreFailures');
      console.warn('Surface texture warmup unavailable; using normal renderer upload.', error);
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
