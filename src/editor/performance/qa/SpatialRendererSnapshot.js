const GROUPS = Object.freeze({
  cpu: ['frameFixedCpuMs', 'frameDeferredCpuMs', 'frameMaxDeferredUnitMs', 'framePreparationBacklogAgeMs'],
  publication: ['framePublicationUploadBytes', 'frameDeferredBudgetMs', 'frameDeferredUnitOverruns'],
  renderer: ['rendererDrawCalls', 'rendererTriangles', 'rendererGeometries', 'rendererTextures'],
  memory: ['regionalTrackedTextureBytes', 'regionalRendererAccountedBytes', 'regionalRendererBudgetExceededBytes',
    'treeImpostorAtlasBytes', 'terrainMaterialFamilyAtlasBytes', 'oceanFftBytes', 'coastalSwashStateBytes'],
  compute: ['gpuCompute.frameCredits', 'gpuCompute.mandatoryCredits', 'gpuCompute.optionalCredits',
    'gpuCompute.deferred', 'gpuCompute.deadlineTurns', 'gpuCompute.overflowCredits'],
  auxiliary: ['auxiliaryGpuAdmission.farShadow.ms', 'auxiliaryGpuAdmission.cube.ms', 'auxiliaryGpuAdmission.planar.ms',
    'gpuOcclusionCandidates', 'gpuOcclusionOccluders', 'gpuOcclusionPrepareMs', 'occlusionLayerExcluded',
    'waterChunksWet', 'waterChunksRefractive'],
});
const value = n => Number.isFinite(n) ? n : null;
export function spatialRendererSnapshot(surface, counters, gpu, now) {
  const info = surface.terrainView.renderer?.info;
  const streaming = surface.terrainView.getStreamingStatus?.();
  return {
    timestamp: now,
    ...Object.fromEntries(Object.entries(GROUPS).map(([group, keys]) => [group,
      Object.fromEntries(keys.map(key => [key, value(counters[key])]))])),
    memory: { ...Object.fromEntries(GROUPS.memory.map(key => [key, value(counters[key])])),
      rendererTotalBytes: value(info?.memory?.total) },
    streaming: streaming ? { resident: streaming.resident, loading: streaming.loading, capacity: streaming.capacity,
      pendingCommits: streaming.pendingCommits, maxQueuedCommitAgeMs: streaming.maxQueuedCommitAgeMs,
      unavailableReason: streaming.unavailableReason } : null,
    computeTotals: Object.fromEntries(Object.entries(counters).filter(([key]) => /^gpuCompute\.[^.]+\.(credits|admitted|deferred|deadline)$/.test(key))),
    gpuRenderSample: gpu ? { ...gpu, ageMs: Math.max(0, now - gpu.timestamp) } : null,
  };
}
