import { surfaceShadowOwners } from './LocationShadowWarmup.js';
import { targetShape } from './LocationTargetWarmup.js';
import { surfacePostTargets } from './LocationPostTargets.js';
import { surfaceAtmosphereTargets } from './LocationAtmosphereTargets.js';
import { environmentShape, estimateEnvironmentFilterBytes } from './LocationEnvironmentWarmup.js';

function targetBytes(renderer, target) {
  const manager = renderer._textures;
  if (!target?.isRenderTarget || !manager?.has(target)) return 0;
  const record = manager.get(target);
  const textures = new Set([...target.textures, record.depthTexture,
    ...Object.values(record.depthTextureMips ?? {})].filter(Boolean));
  let bytes = 0;
  for (const texture of textures) {
    if (!manager.has(texture)) continue;
    const size = renderer.info?.memoryMap?.get(texture);
    if (!Number.isFinite(size) || size <= 0) return 0;
    bytes += size;
  }
  return bytes;
}

/** Retain graph and texture identities; only release explicitly owned target storage. */
export function collectLocationAtmosphereTargets(surface, renderer, settings) {
  const entries = new Map();
  const add = (target, kind, invalidate = () => {}, warmupKey = null) => {
    if (target === renderer.getRenderTarget?.()) return;
    const size = targetBytes(renderer, target);
    if (!size) return;
    const previous = entries.get(target);
    if (previous) {
      previous.invalidations.add(invalidate);
      return;
    }
    entries.set(target, { resource: target, kind, size, distance: Infinity, protected: false,
      deferred: true, target: true, invalidations: new Set([invalidate]),
      targetShape: targetShape(target), warmupKey });
  };
  const terrain = surface.terrainView;
  for (const { target, invalidate } of surfacePostTargets(surface, settings)) {
    add(target, 'post', invalidate);
  }
  for (const { target, invalidate, warmupKey } of surfaceAtmosphereTargets(surface, renderer, settings)) {
    add(target, 'atmosphere', invalidate, warmupKey);
  }
  const sky = surface.skyView;
  for (const shadow of surfaceShadowOwners(surface, renderer, settings)) {
    add(shadow.map, 'shadow', () => { shadow.needsUpdate = true; });
  }
  // HDRLoader owns this source exclusively; r187 PMREMNode listens for its disposal.
  const texture = settings.surfaceEnvironmentReclamationEnabled && sky?.environment?.surfaceTexture;
  if (texture && terrain.scene?.environment === texture && renderer._textures.has(texture)
      && texture.isDataTexture && ArrayBuffer.isView(texture.image?.data) && texture.image.width >= 4) {
    const sourceBytes = renderer.info?.memoryMap?.get(texture);
    // Six RGBA16F faces and at most a full mip chain; generator scratch is retained.
    const size = sourceBytes + estimateEnvironmentFilterBytes(texture.image.width);
    if (Number.isFinite(sourceBytes) && sourceBytes > 0 && Number.isSafeInteger(size)) {
      entries.set(texture, { resource: texture, kind: 'environment', size, distance: Infinity,
        protected: false, deferred: true, environment: true, sourceBytes, environmentShape: environmentShape(texture) });
    }
  }
  return [...entries.values()];
}
