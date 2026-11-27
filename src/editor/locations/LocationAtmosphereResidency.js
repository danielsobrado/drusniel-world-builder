import { VSMShadowMap } from 'three/webgpu';

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
  const add = (target, kind, invalidate = () => {}) => {
    if (target === renderer.getRenderTarget?.()) return;
    const size = targetBytes(renderer, target);
    if (!size) return;
    const previous = entries.get(target);
    if (previous) {
      previous.invalidations.add(invalidate);
      return;
    }
    entries.set(target, { resource: target, kind, size, distance: Infinity, protected: false,
      deferred: true, target: true, invalidations: new Set([invalidate]) });
  };
  const terrain = surface.terrainView;
  const post = terrain.postProcessing;
  if (settings.surfacePostReclamationEnabled && post && !post.disposed && !post.rendererState) {
    const invalidate = () => post.invalidation.invalidate('RENDER_PATH_CHANGED');
    const rtt = node => add(node?.renderTarget, 'post', invalidate);
    for (const { graph } of post.resources.graphs.values()) {
      if (graph.disposed) continue;
      rtt(graph.scenePass);
      add(graph.ambientOcclusion?.aoPass?._aoRenderTarget, 'post', invalidate);
      rtt(graph.ambientOcclusion?.compositeNode);
      rtt(graph.screenSpaceShafts?.radianceNode);
      rtt(graph.screenSpaceShafts?.compositeNode);
      for (const node of graph.hierarchicalDepth?.levels ?? []) rtt(node);
      rtt(graph.ssr?.traceNode);
      rtt(graph.ssr?.compositeNode);
      for (const node of graph.bloom?.targets ?? []) rtt(node);
      for (const node of graph.bloom?.upsampleTargets ?? []) rtt(node);
      rtt(graph.depthOfField?.sourceTarget);
      rtt(graph.sharpen?.sourceTarget);
      rtt(graph.grain?.sourceTarget);
    }
    for (const list of [post.history.taaColourTargets, post.history.taaDepthTargets,
      post.history.ssrColourTargets, post.history.ssrDepthTargets]) {
      for (const target of list) add(target, 'post', invalidate);
    }
  }
  const rays = terrain.godRays;
  if (settings.surfaceAtmosphereReclamationEnabled && rays && !rays.disposed) {
    for (const node of [rays.scenePass, rays.cloudPass, rays.raysTexture]) {
      add(node?.renderTarget, 'atmosphere');
    }
    add(rays.volumetricRays?._godraysRenderTarget, 'atmosphere');
    add(rays.volumetricBlur?._horizontalRT, 'atmosphere');
    add(rays.volumetricBlur?._verticalRT, 'atmosphere');
    for (const node of [rays.cinematicShafts?.mask, rays.cinematicShafts?.march]) {
      add(node?.renderTarget, 'atmosphere', () => { node.initialized = false; });
    }
  }
  const sky = surface.skyView;
  if (settings.surfaceShadowReclamationEnabled && sky && renderer.shadowMap?.type !== VSMShadowMap
      && !surface.farShadowAdmission?.pending) {
    for (const light of [sky.directional, ...(sky.cascades?.node?.lights ?? [])]) {
      const shadow = light?.shadow;
      if (!shadow?.map || !light.castShadow) continue;
      add(shadow.map, 'shadow', () => { shadow.needsUpdate = true; });
    }
  }
  // HDRLoader owns this source exclusively; r187 PMREMNode listens for its disposal.
  const texture = settings.surfaceEnvironmentReclamationEnabled && sky?.environment?.surfaceTexture;
  if (texture && terrain.scene?.environment === texture && renderer._textures.has(texture)
      && texture.isDataTexture && ArrayBuffer.isView(texture.image?.data) && texture.image.width >= 4) {
    const sourceBytes = renderer.info?.memoryMap?.get(texture);
    // Six RGBA16F faces and at most a full mip chain; generator scratch is retained.
    const cubeSize = Math.max(16, 2 ** Math.floor(Math.log2(texture.image.width / 4)));
    const size = sourceBytes + Math.ceil(6 * cubeSize * cubeSize * 8 * 4 / 3);
    if (Number.isFinite(sourceBytes) && sourceBytes > 0 && Number.isSafeInteger(size)) {
      entries.set(texture, { resource: texture, kind: 'environment', size, distance: Infinity,
        protected: false, deferred: true, environment: true });
    }
  }
  return [...entries.values()];
}
