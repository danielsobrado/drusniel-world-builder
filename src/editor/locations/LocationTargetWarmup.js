import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { surfaceShadowOwners } from './LocationShadowWarmup.js';
import { surfacePostTargets } from './LocationPostTargets.js';

const MIB = 1024 * 1024;

export function targetShape(target) {
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
  const current = targetShape(target);
  return ['width', 'height', 'depth', 'samples', 'depthBuffer', 'stencilBuffer'].every(key => current[key] === shape[key])
    && current.textures.length === shape.textures.length
    && current.textures.every((texture, i) => {
      const previous = shape.textures[i];
      return texture === null ? previous === null : previous !== null
        && Object.keys(texture).every(key => texture[key] === previous[key]);
    });
}

function currentOwners(surface, renderer, settings) {
  const targets = new Map();
  const add = (target, kind, invalidate) => {
    if (!target || target === renderer.getRenderTarget?.()) return;
    const existing = targets.get(target);
    if (existing) existing.invalidations.add(invalidate);
    else targets.set(target, { kind, invalidations: new Set([invalidate]) });
  };
  if (settings.surfaceShadowWarmupEnabled) {
    for (const shadow of surfaceShadowOwners(surface, renderer, settings)) {
      add(shadow.map, 'shadow', () => { shadow.needsUpdate = true; });
    }
  }
  if (settings.surfacePostWarmupEnabled) {
    for (const { target, invalidate } of surfacePostTargets(surface, settings, true)) {
      add(target, 'post', invalidate);
    }
  }
  return targets;
}

/** One allocation per yield, with a shared charge ceiling across target owners. */
export async function warmLocationTargets({ surface, renderer, settings, entries, pause, signal, active }) {
  if ((!settings.surfaceShadowWarmupEnabled && !settings.surfacePostWarmupEnabled)
      || typeof renderer.initRenderTarget !== 'function') return;
  const retired = new Map(entries.filter(entry => entry.target && ['shadow', 'post'].includes(entry.kind))
    .map(entry => [entry.resource, entry]));
  if (!retired.size) return;
  const initial = renderer.info?.memory?.total;
  if (!Number.isFinite(initial) || initial < 0) return;
  let reserved = 0;
  const charges = { shadow: 0, post: 0 };
  const budgets = {
    shadow: [settings.surfaceShadowWarmupMaxBytes, settings.surfaceShadowWarmupMaxTargetBytes],
    post: [settings.surfacePostWarmupMaxBytes, settings.surfacePostWarmupMaxTargetBytes]
  };
  const owners = currentOwners(surface, renderer, settings);
  for (const [target, owner] of owners) {
    const entry = retired.get(target);
    const kind = owner.kind;
    const [maxBytes, maxTarget] = budgets[kind];
    if (!entry || entry.kind !== kind || !Number.isFinite(entry.size) || entry.size <= 0
        || entry.size > maxTarget || charges[kind] + entry.size > maxBytes
        || reserved + entry.size > settings.surfaceTargetWarmupMaxBytes
        || renderer._textures.has(target)) continue;
    await pause();
    signal?.throwIfAborted();
    if (!active() || renderer._isDeviceLost) return;
    const live = currentOwners(surface, renderer, settings).get(target);
    if (!live || live.kind !== kind || renderer._textures.has(target)
        || !sameShape(target, entry.targetShape)) continue;
    const total = renderer.info?.memory?.total;
    if (!Number.isFinite(total) || total < 0
        || Math.max(total, initial + reserved) + entry.size > settings.surfaceAdaptiveHighMiB * MIB) continue;
    try {
      // Allocation is not publication of rendered contents.
      for (const invalidate of live.invalidations) invalidate();
      renderer.initRenderTarget(target);
      if (!renderer._textures.has(target)) throw new Error('Render target allocation was not registered.');
      reserved += entry.size;
      charges[kind] += entry.size;
      PerfCounters.inc(`locationSurface.${kind}WarmupTargets`);
      PerfCounters.inc(`locationSurface.${kind}WarmupChargeBytes`, entry.size);
      PerfCounters.inc('locationSurface.targetWarmupTargets');
      PerfCounters.inc('locationSurface.targetWarmupChargeBytes', entry.size);
    } catch (error) {
      PerfCounters.inc(`locationSurface.${kind}WarmupFailures`);
      PerfCounters.inc('locationSurface.targetWarmupFailures');
      console.warn('Surface target warmup unavailable; using normal rendering.', error);
      return;
    }
  }
}
