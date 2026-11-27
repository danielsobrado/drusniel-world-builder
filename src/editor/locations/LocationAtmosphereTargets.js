function postAvailable(post) {
  return post && !post.disposed && post.settings?.enabled === true
    && !post.isBypassed?.() && !post.isCurrentTopologyFailed?.();
}

/** Match the outdoor draw order without activating a graph or rendering. */
export function preferredAtmosphereTechnique(terrain) {
  const rays = terrain.godRays;
  if (!rays?.enabled || rays.disposed) return null;
  if (rays.technique === 'cinematic') return 'cinematic';
  if (rays.technique === 'volumetric') {
    return rays.volumetricPipeline || rays.canBuildVolumetricPipeline?.()
      ? 'volumetric' : 'screen-space';
  }
  if (rays.technique === 'screen-space' && !postAvailable(terrain.postProcessing)) return 'screen-space';
  return null;
}

export function atmospherePrecedesPost(terrain) {
  const rays = terrain.godRays;
  return Boolean(rays?.enabled && !rays.disposed
    && ['cinematic', 'volumetric'].includes(rays.technique));
}

function allocationKey(rays, renderer) {
  const canvas = renderer.domElement;
  return JSON.stringify([rays.technique, rays.config?.resolutionScale,
    rays.config?.volumetric?.resolutionScale, canvas?.width, canvas?.height]);
}

/** All retained targets may retire; only the predicted return path may warm. */
export function* surfaceAtmosphereTargets(surface, renderer, settings, activeOnly = false) {
  const terrain = surface.terrainView;
  const rays = terrain.godRays;
  if (!settings.surfaceAtmosphereReclamationEnabled || !rays || rays.disposed) return;
  const selected = activeOnly ? preferredAtmosphereTechnique(terrain) : null;
  if (activeOnly && (!selected || (rays.camera && !rays.camera.isPerspectiveCamera))) return;
  const screen = !activeOnly || (selected === 'screen-space' && rays.screenPipeline);
  const volumetric = !activeOnly || (selected === 'volumetric' && rays.volumetricPipeline);
  const cinematic = !activeOnly || (selected === 'cinematic' && rays.cinematicPipeline);
  if (!screen && !volumetric && !cinematic) return;
  const key = allocationKey(rays, renderer);
  const emit = function* (target, invalidate = () => {}) {
    if (target) yield { target, invalidate, warmupKey: key };
  };
  yield* emit(rays.scenePass?.renderTarget);
  if (screen || volumetric) yield* emit(rays.cloudPass?.renderTarget);
  if (screen) yield* emit(rays.raysTexture?.renderTarget);
  if (volumetric) {
    yield* emit(rays.volumetricRays?._godraysRenderTarget);
    yield* emit(rays.volumetricBlur?._horizontalRT);
    yield* emit(rays.volumetricBlur?._verticalRT);
  }
  if (cinematic && !rays.cinematicShafts?.disposed) {
    const shafts = rays.cinematicShafts;
    const invalidate = () => {
      if (shafts?.mask) shafts.mask.initialized = false;
      if (shafts?.march) shafts.march.initialized = false;
    };
    yield* emit(shafts?.mask?.renderTarget, invalidate);
    yield* emit(shafts?.march?.renderTarget, invalidate);
  }
}
