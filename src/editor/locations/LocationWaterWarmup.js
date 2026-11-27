import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { waterVisualClock } from '../water/WaterVisualClock.js';

const MIB = 1024 * 1024;

export function waterNearReturn(surface, anchor, radius, oceanOnly = false) {
  if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.z)
      || !Number.isFinite(radius) || radius <= 0) return false;
  const half = Math.max(0, surface.terrainView.chunkWorldSize ?? 0) / 2;
  return surface.waterSlots.some(slot => {
    const descriptor = slot.terrainSlot?.descriptor;
    if (!descriptor || !slot.mesh?.visible || slot.terrainSlot.loading
        || !(oceanOnly ? slot.hasOceanWater : slot.hasWaterCoverage)) return false;
    return Math.hypot(Math.max(0, Math.abs(descriptor.centerWorldX - anchor.x) - half),
      Math.max(0, Math.abs(descriptor.centerWorldZ - anchor.z) - half)) <= radius;
  });
}

/** Return conservative charges to the shared scheduler, even if a later stage fails. */
export async function warmLocationWater({ surface, renderer, settings, entries, anchor, pause, signal,
  active, initial, reserved }) {
  let charged = 0;
  const safe = () => active() && !renderer._isDeviceLost && renderer.getRenderTarget?.() == null
    && renderer.getMRT?.() == null && renderer.xr?.isPresenting !== true;
  const fits = (bytes, max) => {
    const total = renderer.info?.memory?.total;
    return Number.isFinite(bytes) && bytes > 0 && bytes <= max
      && reserved + charged + bytes <= settings.surfaceTargetWarmupMaxBytes
      && Number.isFinite(total) && total >= 0
      && Math.max(total, initial + reserved + charged) + bytes <= settings.surfaceAdaptiveHighMiB * MIB;
  };
  const fft = surface.oceanFft;
  const fftEntry = entries.find(entry => entry.kind === 'fft' && entry.resource === fft);
  const oceanNearby = () => waterNearReturn(surface, anchor, settings.surfaceWaterWarmupMeters, true);
  if (settings.surfaceOceanFftWarmupEnabled && settings.surfaceOceanFftReclamationEnabled
      && fftEntry && fft?.prepareSurfaceResources && fft.runtime?.renderer === renderer
      && oceanNearby() && fits(fftEntry.size, settings.surfaceOceanFftWarmupMaxBytes)) {
    await pause();
    signal?.throwIfAborted();
    if (safe() && surface.oceanFft === fft && oceanNearby()
        && fits(fftEntry.size, settings.surfaceOceanFftWarmupMaxBytes)) {
      try {
        charged += fftEntry.size;
        if (fft.prepareSurfaceResources()) {
          PerfCounters.inc('locationSurface.fftWarmupPreparations');
          if (settings.surfaceOceanFftWarmupComputeEnabled) {
            await pause();
            signal?.throwIfAborted();
            if (safe() && surface.oceanFft === fft && oceanNearby()
                && Number.isFinite(renderer.info?.memory?.total)
                && Math.max(renderer.info.memory.total, initial + reserved + charged) <= settings.surfaceAdaptiveHighMiB * MIB) {
              if (fft.warmSurfaceTransform(waterVisualClock.value)) PerfCounters.inc('locationSurface.fftWarmupTransforms');
            }
          }
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        PerfCounters.inc('locationSurface.fftWarmupFailures');
        console.warn('FFT transition warmup unavailable; using normal ocean preparation.', error);
      }
    }
  }
  const reflection = surface.reflections;
  const reflectionEntry = entries.find(entry => entry.kind === 'reflection' && entry.resource === reflection);
  const wetNearby = () => waterNearReturn(surface, anchor, Math.min(settings.surfaceWaterWarmupMeters,
    reflection.config?.reachMeters ?? 0));
  if (!settings.surfaceReflectionWarmupEnabled || !settings.surfaceReflectionReclamationEnabled
      || !reflectionEntry || reflection?.view?.renderer !== renderer || !reflection.surfaceWarmupTargets
      || typeof renderer.initRenderTarget !== 'function' || !wetNearby()) return charged;
  let reflectionCharge = 0;
  for (const candidate of reflection.surfaceWarmupTargets()) {
    if (!fits(candidate.bytes, settings.surfaceReflectionWarmupMaxBytes - reflectionCharge)) continue;
    await pause();
    signal?.throwIfAborted();
    if (!safe() || surface.reflections !== reflection || !wetNearby()) return charged;
    const live = reflection.surfaceWarmupTargets().find(item => item.target === candidate.target
      && item.bytes === candidate.bytes && item.width === candidate.width && item.height === candidate.height);
    if (!live || !fits(live.bytes, settings.surfaceReflectionWarmupMaxBytes - reflectionCharge)) continue;
    try {
      charged += live.bytes;
      reflectionCharge += live.bytes;
      renderer.initRenderTarget(live.target);
      if (!renderer._textures.has(live.target)) throw new Error('Reflection allocation was not registered.');
      PerfCounters.inc('locationSurface.reflectionWarmupTargets');
      PerfCounters.inc('locationSurface.reflectionWarmupChargeBytes', live.bytes);
    } catch (error) {
      PerfCounters.inc('locationSurface.reflectionWarmupFailures');
      console.warn('Reflection transition warmup unavailable; using normal capture allocation.', error);
      return charged;
    }
  }
  return charged;
}
