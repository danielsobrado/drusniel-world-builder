import { VSMShadowMap } from 'three/webgpu';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

const MIB = 1024 * 1024;

export function* surfaceShadowOwners(surface, renderer, settings) {
  const sky = surface.skyView;
  if (!settings.surfaceShadowReclamationEnabled || !sky || renderer.shadowMap?.type === VSMShadowMap
      || surface.farShadowAdmission?.pending) return;
  for (const light of [sky.directional, ...(sky.cascades?.node?.lights ?? [])]) {
    const shadow = light?.shadow;
    if (light?.castShadow && shadow?.map && shadow.map !== renderer.getRenderTarget?.()) yield shadow;
  }
}

export function shadowTargetShape(target) {
  return { width: target.width, height: target.height, depth: target.depth,
    samples: target.samples, depthBuffer: target.depthBuffer, stencilBuffer: target.stencilBuffer,
    textures: [...target.textures, target.depthTexture].map(texture => texture
      ? { texture, width: texture.image?.width, height: texture.image?.height,
        depth: texture.image?.depth, format: texture.format, type: texture.type } : null) };
}

function sameShape(target, shape) {
  if (!target?.isRenderTarget || target.isCubeRenderTarget || target.isXRRenderTarget
      || target.isRenderTargetArray || target.isRenderTarget3D || target.multiview
      || target.samples > 1 || !shape) return false;
  const current = shadowTargetShape(target);
  return ['width', 'height', 'depth', 'samples', 'depthBuffer', 'stencilBuffer'].every(key => current[key] === shape[key])
    && current.textures.length === shape.textures.length
    && current.textures.every((texture, i) => {
      const previous = shape.textures[i];
      return texture === null ? previous === null : previous !== null
        && Object.keys(texture).every(key => texture[key] === previous[key]);
    });
}

/** Allocate storage only. Shadow contents must be rendered by their normal owner. */
export async function warmLocationShadows({ surface, renderer, settings, entries, pause, signal, active }) {
  if (!settings.surfaceShadowWarmupEnabled || typeof renderer.initRenderTarget !== 'function') return;
  const retired = new Map(entries.filter(entry => entry.kind === 'shadow' && entry.target)
    .map(entry => [entry.resource, entry]));
  if (!retired.size) return;
  const initial = renderer.info?.memory?.total;
  if (!Number.isFinite(initial) || initial < 0) return;
  let reserved = 0;
  const targets = [...new Set([...surfaceShadowOwners(surface, renderer, settings)].map(shadow => shadow.map))];
  for (const target of targets) {
    const entry = retired.get(target);
    if (!entry || !Number.isFinite(entry.size) || entry.size <= 0
        || entry.size > settings.surfaceShadowWarmupMaxTargetBytes
        || reserved + entry.size > settings.surfaceShadowWarmupMaxBytes
        || renderer._textures.has(target)) continue;
    await pause();
    signal?.throwIfAborted();
    if (!active() || renderer._isDeviceLost) return;
    const owners = [...surfaceShadowOwners(surface, renderer, settings)].filter(shadow => shadow.map === target);
    if (!owners.length || renderer._textures.has(target) || !sameShape(target, entry.shadowShape)) continue;
    const total = renderer.info?.memory?.total;
    if (!Number.isFinite(total) || total < 0
        || Math.max(total, initial + reserved) + entry.size > settings.surfaceAdaptiveHighMiB * MIB) continue;
    try {
      for (const shadow of owners) shadow.needsUpdate = true;
      renderer.initRenderTarget(target);
      if (!renderer._textures.has(target)) throw new Error('Shadow target allocation was not registered.');
      reserved += entry.size;
      PerfCounters.inc('locationSurface.shadowWarmupTargets');
      PerfCounters.inc('locationSurface.shadowWarmupChargeBytes', entry.size);
    } catch (error) {
      PerfCounters.inc('locationSurface.shadowWarmupFailures');
      console.warn('Shadow target warmup unavailable; using normal shadow rendering.', error);
      return;
    }
  }
}
