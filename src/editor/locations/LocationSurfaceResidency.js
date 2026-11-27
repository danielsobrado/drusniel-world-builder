import { REVISION } from 'three/webgpu';
import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { collectLocationAtmosphereTargets } from './LocationAtmosphereResidency.js';
import { collectLocationTownAttributes } from './LocationTownResidency.js';
import { collectLocationGpuImpostorAttributes } from './LocationGpuImpostorResidency.js';
import { collectLocationSceneryAttributes } from './LocationSceneryResidency.js';
import { collectLocationMeadowAttributes } from './LocationMeadowResidency.js';
import { getTerrainMaterialBakeGpuState } from '../materials/TerrainMaterialBakeGpu.js';
import { warmLocationTargets } from './LocationTargetWarmup.js';
import { LocationSurfaceExitWarmup } from './LocationSurfaceExitWarmup.js';
import { LocationSurfaceMemoryPolicy } from './LocationSurfaceMemoryPolicy.js';
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
    this.memoryPolicy = new LocationSurfaceMemoryPolicy(settings);
    this.exitWarmup = new LocationSurfaceExitWarmup(settings);
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
      const protectedSlot = slot.loading || pending?.has(slot.mesh);
      add(slot, TERRAIN_TEXTURES, slot.descriptor, protectedSlot);
      if (this.settings.surfaceTerrainBakeReclamationEnabled) {
        const state = getTerrainMaterialBakeGpuState(slot.mesh);
        if (state && !state.disposed) add(state.textures, Object.keys(state.textures), slot.descriptor, protectedSlot);
      }
    }
    for (const slot of this.surface.waterSlots) {
      add(slot, WATER_TEXTURES, slot.terrainSlot.descriptor, slot.terrainSlot.loading || pending?.has(slot.mesh));
    }
    for (const entry of [...collectLocationMeadowAttributes(this.surface, this.renderer, anchor, this.settings),
      ...collectLocationSceneryAttributes(this.surface, this.renderer, anchor, this.settings),
      ...collectLocationGpuImpostorAttributes(this.surface, this.renderer, anchor, this.settings),
      ...collectLocationTownAttributes(this.surface, this.renderer, anchor, this.settings)]) {
      const previous = candidates.get(entry.resource);
      if (previous) {
        previous.protected ||= entry.protected;
        previous.distance = Math.min(previous.distance, entry.distance);
      } else candidates.set(entry.resource, entry);
    }
    for (const [kind, owner, enabled] of [
      ['fft', this.surface.oceanFft, this.settings.surfaceOceanFftReclamationEnabled],
      ['reflection', this.surface.reflections, this.settings.surfaceReflectionReclamationEnabled],
    ]) {
      if (!enabled || !owner?.surfaceReclaimableBytes || !owner?.suspendSurfaceResources) continue;
      const size = owner.surfaceReclaimableBytes();
      if (Number.isFinite(size) && size > 0) candidates.set(owner, {
        resource: owner, kind, size, distance: Infinity, protected: false, deferred: true });
    }
    for (const entry of collectLocationAtmosphereTargets(this.surface, this.renderer, this.settings)) {
      if (!candidates.has(entry.resource)) candidates.set(entry.resource, entry);
    }
    return [...candidates.values()];
  }

  resident(entry) {
    if (entry.target || entry.environment) return this.renderer._textures.has(entry.resource);
    if (entry.deferred) return entry.resource.surfaceReclaimableBytes() > 0;
    return entry.kind !== 'texture' ? this.renderer._attributes.has(entry.resource) : this.renderer._textures.has(entry.resource);
  }

  retire(entry) {
    if (entry.environment) { entry.resource.dispose(); return; }
    if (entry.target) {
      for (const invalidate of entry.invalidations) invalidate();
      entry.resource.dispose();
      return;
    }
    if (entry.deferred) return entry.resource.suspendSurfaceResources();
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

  update(now = performance.now(), location = null, feet = null) {
    if (this.phase !== 'inside' || this.renderer._isDeviceLost) return;
    if (this.exitWarmup.approaching(location, feet)) {
      this.nextSample = now + this.settings.surfaceIdleMs;
      this.prefetchExit(now);
      return;
    }
    if (now < this.nextSample) return;
    this.nextSample = now + this.settings.surfaceSampleMs;
    try {
      const mode = this.memoryPolicy.sample(this.renderer);
      if (mode === 'idle') return;
      this.candidates = this.collect(this.anchor).filter(entry => !entry.protected
        && !this.evicted.has(entry.resource) && !this.exitWarmup.pinned.has(entry.resource) && this.resident(entry));
      const adaptive = mode === 'pressure';
      const ordered = adaptive ? this.memoryPolicy.rank(this.candidates, this.renderer)
        : this.candidates.sort((a, b) => b.distance - a.distance || b.size - a.size)
          .map(entry => ({ entry, charge: this.memoryPolicy.charge(entry, this.renderer) }));
      let remaining = this.settings.surfaceEvictionsPerSample;
      for (const { entry, charge } of ordered) {
        if (remaining <= 0 || (adaptive && this.memoryPolicy.sample(this.renderer) !== 'pressure')) break;
        if (this.settings.surfaceAdaptiveReclamationEnabled && !this.memoryPolicy.allows(charge)) continue;
        if (!adaptive && this.evictedBytes + entry.size > this.settings.surfaceMaxEvictedBytes) continue;
        remaining--;
        const retired = this.retire(entry);
        if (retired === false || this.resident(entry)) continue;
        this.evicted.set(entry.resource, { ...entry, allocationCharge: charge });
        this.memoryPolicy.record(charge);
        if (entry.kind !== 'texture') {
          PerfCounters.inc(`locationSurface.${entry.kind}Evictions`);
          PerfCounters.inc(`locationSurface.${entry.kind}EvictedBytes`, entry.size);
        }
        this.evictedBytes += entry.size;
        PerfCounters.inc('locationSurface.evictions');
        PerfCounters.inc('locationSurface.evictedBytes', entry.size);
      }
      if (adaptive) this.memoryPolicy.sample(this.renderer);
    } catch (error) {
      this.phase = 'paused';
      console.warn('Surface resource reclamation paused.', error);
    } finally {
      this.candidates.length = 0;
      this.publish();
    }
  }

  prefetchExit(now) {
    if (!this.evicted.size || !this.exitWarmup.beginSample(now)) return;
    try {
      const current = new Map(this.collect(this.anchor).map(entry => [entry.resource, entry]));
      const entries = [...this.evicted.values()].filter(entry => !entry.deferred)
        .sort((a, b) => a.distance - b.distance);
      let count = 0, uploaded = 0, reserved = 0;
      const initialTotal = this.renderer.info?.memory?.total;
      for (const entry of entries) {
        if (count >= this.settings.surfaceRestoresPerFrame || this.renderer._isDeviceLost) break;
        const live = current.get(entry.resource);
        if (!live || live.deferred || this.resident(live)) continue;
        if (uploaded + live.size > this.settings.surfaceRestoreBytesPerFrame) continue;
        // A retired allocation is absent from memoryMap; retain the pre-retirement charge.
        const charge = Math.max(live.size, entry.allocationCharge ?? entry.size);
        const total = Math.max(initialTotal + reserved, this.renderer.info?.memory?.total);
        if (!this.exitWarmup.allows(total, charge)) continue;
        this.warm(live);
        count++;
        uploaded += live.size;
        reserved += charge;
        if (!this.resident(live)) {
          this.exitWarmup.failed = true;
          break;
        }
        this.exitWarmup.record(entry.resource, charge);
        this.evicted.delete(entry.resource);
        this.evictedBytes -= entry.size;
        PerfCounters.inc('locationSurface.exitWarmupRestores');
        PerfCounters.inc('locationSurface.exitWarmupBytes', live.size);
      }
    } catch (error) {
      this.exitWarmup.failed = true;
      PerfCounters.inc('locationSurface.exitWarmupFailures');
      console.warn('Predictive surface warmup paused; using normal exit restoration.', error);
    } finally {
      this.publish();
    }
  }

  publish() {
    let textures = 0, meadow = 0, scenery = 0, impostor = 0, town = 0, deferred = 0, targets = 0, environments = 0;
    for (const entry of this.evicted.values()) {
      if (entry.environment) environments++;
      else if (entry.target) targets++;
      else if (entry.deferred) deferred++;
      else if (entry.kind === 'meadow') meadow++;
      else if (entry.kind === 'scenery') scenery++;
      else if (entry.kind === 'impostor') impostor++;
      else if (entry.kind === 'town') town++;
      else textures++;
    }
    PerfCounters.set('locationSurface.pendingTextures', textures);
    PerfCounters.set('locationSurface.pendingMeadowAttributes', meadow);
    PerfCounters.set('locationSurface.pendingSceneryAttributes', scenery);
    PerfCounters.set('locationSurface.pendingImpostorAttributes', impostor);
    PerfCounters.set('locationSurface.pendingTownAttributes', town);
    PerfCounters.set('locationSurface.deferredWaterOwners', deferred);
    PerfCounters.set('locationSurface.deferredOutdoorTargets', targets);
    PerfCounters.set('locationSurface.deferredEnvironmentTextures', environments);
    PerfCounters.set('locationSurface.pendingBytes', this.evictedBytes);
    PerfCounters.set('locationSurface.exitWarmupPinned', this.exitWarmup.pinned.size);
    PerfCounters.set('locationSurface.exitWarmupChargeBytes', this.exitWarmup.charge);
    PerfCounters.set('locationSurface.adaptiveAccountingAvailable', this.memoryPolicy.accountedTotal === null ? 0 : 1);
    PerfCounters.set('locationSurface.adaptiveRendererBytes', this.memoryPolicy.accountedTotal ?? 0);
    PerfCounters.set('locationSurface.adaptivePressure', this.memoryPolicy.pressure ? 1 : 0);
    PerfCounters.set('locationSurface.adaptiveEvictedChargeBytes', this.memoryPolicy.evictedCharge);
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
        // Derived contents are regenerated by their owners; eligible storage is warmed separately.
        let live = entry.deferred ? null : current.get(entry.resource);
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
      if (this.phase === 'restoring' && !this.renderer._isDeviceLost) {
        await warmLocationTargets({ surface: this.surface, renderer: this.renderer, settings: this.settings,
          entries, pause: this.pause, signal, active: () => this.phase === 'restoring' });
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
    this.memoryPolicy.reset();
    this.exitWarmup.reset();
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
