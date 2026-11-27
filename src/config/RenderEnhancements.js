export const RENDER_ENHANCEMENT_DEFAULTS = Object.freeze({
  detailVisibility: false, detailTurnMarginDegrees: 12, shadowCascades: 1, snowRelief: true, roadsideLanterns: false,
  // Near-band tree crowns cast sun shadows. Off: the cost and the crowns' own self-shadowing are unmeasured.
  crownShadows: false,
  // QA override of water.sea.offshoreFft.enabled (PR I): `?oceanFft=1` forces the offshore FFT on.
  oceanFft: false,
  geologyLod: false,
  regionalGeologyAdmission: false,
  locationDecorationAdmission: false,
  locationStructureStreaming: false,
  locationStructureBudget: Object.freeze({ cellMeters: 28, minPropTriangles: 512, protectMeters: 56, idleMs: 5000, sampleMs: 250, evictionsPerSample: 2,
    prefetchEnabled: false, prefetchExtraMeters: 28, prefetchLookaheadMs: 1000, prefetchMaxLeadMeters: 28,
    prefetchSliceBytes: 262144, prefetchMaxDetachedBytes: 33554432, prefetchMaxAllocationsPerFrame: 2, prefetchMaxMs: 1,
    portalEnabled: false, portalCull: false, portalCellMeters: 12, portalMaxCells: 8192, portalMaxSampleReads: 8000000,
    generationEnabled: false, generationWorker: true, generationSliceMs: 4, generationMaxCopyBytes: 67108864, generationWorkerTimeoutMs: 120000,
    lightingEnabled: false, lightingSliceMs: 4,
    surfaceReclamationEnabled: false, surfaceMeadowReclamationEnabled: false, surfaceMeadowProtectMeters: 32, surfaceSceneryReclamationEnabled: false, surfaceGpuImpostorReclamationEnabled: false, surfaceTownReclamationEnabled: false, surfaceTerrainBakeReclamationEnabled: false, surfaceOceanFftReclamationEnabled: false, surfaceReflectionReclamationEnabled: false, surfacePostReclamationEnabled: false, surfaceAtmosphereReclamationEnabled: false, surfaceShadowReclamationEnabled: false, surfaceEnvironmentReclamationEnabled: false, surfaceTownProtectMeters: 96, surfaceSceneryProtectMeters: 64, surfaceProtectMeters: 192, surfaceIdleMs: 5000, surfaceSampleMs: 500,
    surfaceOceanFftWarmupEnabled: false, surfaceOceanFftWarmupComputeEnabled: false, surfaceOceanFftWarmupMaxBytes: 67108864,
    surfaceReflectionWarmupEnabled: false, surfaceReflectionWarmupMaxBytes: 33554432, surfaceWaterWarmupMeters: 192,
    surfaceEnvironmentWarmupEnabled: false, surfaceEnvironmentWarmupMaxBytes: 67108864,
    surfaceAtmosphereWarmupEnabled: false, surfaceAtmosphereWarmupMaxBytes: 67108864, surfaceAtmosphereWarmupMaxTargetBytes: 33554432,
    surfaceTargetWarmupMaxBytes: 134217728, surfacePostWarmupEnabled: false, surfacePostWarmupMaxBytes: 134217728, surfacePostWarmupMaxTargetBytes: 67108864,
    surfaceShadowWarmupEnabled: false, surfaceShadowWarmupMaxBytes: 134217728, surfaceShadowWarmupMaxTargetBytes: 67108864,
    surfaceExitWarmupEnabled: false, surfaceExitWarmupMeters: 12, surfaceExitWarmupSampleMs: 250, surfaceExitWarmupMaxBytes: 33554432,
    surfaceAdaptiveReclamationEnabled: false, surfaceAdaptiveHighMiB: 4096, surfaceAdaptiveLowMiB: 3584, surfaceAdaptiveMaxMiB: 512, surfaceAdaptiveDeferredCost: 4, surfaceAdaptiveImpostorCost: 2,
    surfaceEvictionsPerSample: 4, surfaceMaxEvictedBytes: 33554432, surfaceRestoreBytesPerFrame: 2097152, surfaceRestoresPerFrame: 4 }),
  geologyAdmissionBudget: Object.freeze({ triangleBudget: 100000, protectMeters: 64, minimumScaleMultiplier: 24, maxExtraDraws: 8, recoveryRatio: 0.85 }),
  locationDecorationBudget: Object.freeze({ cellMeters: 24, protectMeters: 24, maxDistanceMeters: 100, triangleBudget: 60000, drawBudget: 24, recoveryMeters: 4, boundsPaddingMeters: 1, refreshMeters: 1 }),
  regionalTerrainProfiles: false,
  regionalLazyTrees: false,
  regionalTreeSourceRelease: false,
  regionalResourceBudget: false,
  regionalDensityBudget: false,
  regionalSpatialBudget: false,
  spatialPerformanceOverlay: false,
  spatialOverlay: Object.freeze({ refreshMs: 500, radius: 8 }),
  regionalGeometryCostBudget: false,
  regionalAdmissionBudget: false,
  rendererAdmissionBudget: false,
  regionalInstancePublicationBudget: false,
  slicedInstancePublication: false,
  initialInstanceUploadSlicing: false,
  initialInstanceUploadBudget: Object.freeze({ sliceBytes: 262144, maxDetachedBytes: 33554432, maxAllocationsPerFrame: 2, maxRestarts: 3, handoffTimeoutMs: 2000 }),
  instanceSliceBudget: Object.freeze({ sliceBytes: 262144, maxStagingBytes: 16777216, maxCopyRanges: 8192, maxWritesPerSlice: 64 }),
  renderLayerIsolation: false,
  gpuComputeAdmission: false,
  gpuComputeBudget: Object.freeze({ frameCredits: 32, mandatoryReserveCredits: 8, maxFrameGapMs: 250,
    credits: Object.freeze({ fft: 1, snow: 3, occlusion: 8, impostor: 1, ripple: 2, swash: 2, deformation: 2 }),
    maxDeferralMs: Object.freeze({ fft: 34, snow: 34, occlusion: 100 }) }),
  farShadowAdmission: false,
  reflectionAdmission: false,
  townDecorationAdmission: false,
  environmentalParticleAdmission: false,
  measuredGpuAdmission: false,
  gpuAdmissionBudget: Object.freeze({ sampleEvery: 8, maxAgeMs: 1500, targetRenderMs: 12, recoveryRenderMs: 9,
    pressureSamples: 3, recoverySamples: 8, minimumDwellMs: 2000,
    passMs: Object.freeze({ ao: 1.2, ssr: 1.5, bloom: 1, shafts: 1.2, volumetric: 1.5 }),
    auxiliaryPassMs: Object.freeze({ farShadow: 1.5, cube: 1.5, planar: 2 }) }),
  atmosphericPassAdmission: false,
  atmosphericPassBudget: Object.freeze({ targetFrameMs: 18, recoveryFrameMs: 17, pressureMs: 300, recoveryMs: 2000, minimumDwellMs: 3000, maxFrameGapMs: 250,
    ssrStepFactor: 0.65, ssrMinimumSteps: 12, shaftSampleFactor: 0.5, shaftMinimumSamples: 8,
    volumetricStepFactor: 0.6, volumetricMinimumSteps: 16, aoResolutionFactor: 0.75, aoMinimumResolution: 0.25, reduceBloomFilter: true }),
  environmentalFragmentAdmission: false,
  coastalSprayCompaction: false,
  environmentalFragmentBudget: Object.freeze({ fogStepFactor: 0.5, fogMinimumSteps: 3, fogProtectedDistanceMeters: 20,
    frameCpuPressureMs: 12, recoveryMs: 800, transparentAlphaCutoff: 0.003 }),
  environmentalParticleBudget: Object.freeze({ particleBudget: 18000, pressureFactor: 0.65,
    frameCpuPressureMs: 12, sampleMs: 200, recoveryMs: 800, protectWaterfallMeters: 60,
    minimumShares: Object.freeze({ precipitation: 0.6, dust: 0.5, splash: 0.25, waterfall: 0.25, ambient: 0.15 }) }),
  townDecorationBudget: Object.freeze({ triangleBudget: 60000, drawBudget: 24, protectMeters: 100,
    omitDistanceMeters: 180, refreshMeters: 6, recoveryRatio: 0.85 }),
  auxiliaryPassBudget: Object.freeze({ farShadowIntervalMs: 33, farShadowMaxAgeMs: 100, farShadowMoveMeters: 0.5,
    farShadowTurnDegrees: 1, farShadowSunDegrees: 0.15, frameCpuPressureMs: 12,
    cubeCaptureCpuBudgetMs: 1.5, planarCaptureCpuBudgetMs: 2, reflectionUrgentDeferralMs: 80, reflectionMaxDeferralMs: 250 }),
  regionalBudget: Object.freeze({ idleMs: 30000, maxTrackedTextureMiB: 256, maxRendererMiB: 4096, evictionsPerFrame: 1, farGrassPressure: 0.85,
    sceneryLodPressure: 0.85, protectedChunkRadius: 1, spatialChunkRadius: 8, spatialChunkBudget: 1200,
    spatialLodFactor: 0.75, spatialCardFactor: 0.8, spatialWorkItems: 256,
    spatialTriangleBudget: 200000, spatialDrawBudget: 100, spatialReflectionPassWeight: 0.25,
    rendererAdmissionTriangleBudget: 4000000, rendererAdmissionDrawBudget: 1500,
    rendererAdmissionTransitionReserve: 0.15, rendererAdmissionUploadHeadroom: 0.5, rendererAdmissionMaxChanges: 8,
    admissionFactors: Object.freeze([1, 0.85, 0.7, 0.5]),
    admissionPriorities: Object.freeze({ tree: 4, rock: 3, bush: 2, card: 1 }),
    spatialWeights: Object.freeze({ town: 1, tree: 8, rock: 3, bush: 2, blade: 0.01, card: 0.15, detail: 1, water: 50 }), sampleIntervalMs: 1000, triangleBudget: 4000000, drawBudget: 1500, townInstanceBudget: 3000, recoveryRatio: 0.75 }),
  r187: Object.freeze({ depthOnlyOcclusion: false, prioritizedRequests: false, maxConcurrentRequests: 6, maxConcurrentDecodes: 2, requestMaxWaitMs: 500 }),
  surfaceAnisotropy: Object.freeze({ enabled: true, level: 16 }),
  waterReflections: Object.freeze({
    enabled: true,
    planar: true,
    roughnessFiltering: true,
    resolution: 128,
    intervalMs: 500,
    reachMeters: 96,
    captureFrameStride: 4,
    captureSafetyFactor: 1.25,
    initialCaptureCpuMs: 2,
    maxCaptureDeferralMs: 100,
  }),
});

export function resolveRenderEnhancements(source = {}, search = '', { mobile = false } = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('Render enhancements must be an object.');
  const value = { ...RENDER_ENHANCEMENT_DEFAULTS, ...source,
    r187: { ...RENDER_ENHANCEMENT_DEFAULTS.r187, ...source.r187 },
    spatialOverlay: { ...RENDER_ENHANCEMENT_DEFAULTS.spatialOverlay, ...source.spatialOverlay },
    regionalBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.regionalBudget, ...source.regionalBudget,
      spatialWeights: { ...RENDER_ENHANCEMENT_DEFAULTS.regionalBudget.spatialWeights, ...source.regionalBudget?.spatialWeights },
      admissionPriorities: { ...RENDER_ENHANCEMENT_DEFAULTS.regionalBudget.admissionPriorities, ...source.regionalBudget?.admissionPriorities } },
    geologyAdmissionBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.geologyAdmissionBudget, ...source.geologyAdmissionBudget },
    locationStructureBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.locationStructureBudget, ...source.locationStructureBudget },
    locationDecorationBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.locationDecorationBudget, ...source.locationDecorationBudget },
    initialInstanceUploadBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.initialInstanceUploadBudget, ...source.initialInstanceUploadBudget },
    instanceSliceBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.instanceSliceBudget, ...source.instanceSliceBudget },
    gpuAdmissionBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.gpuAdmissionBudget, ...source.gpuAdmissionBudget,
      passMs: { ...RENDER_ENHANCEMENT_DEFAULTS.gpuAdmissionBudget.passMs, ...source.gpuAdmissionBudget?.passMs },
      auxiliaryPassMs: { ...RENDER_ENHANCEMENT_DEFAULTS.gpuAdmissionBudget.auxiliaryPassMs, ...source.gpuAdmissionBudget?.auxiliaryPassMs } },
    atmosphericPassBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.atmosphericPassBudget, ...source.atmosphericPassBudget },
    environmentalFragmentBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.environmentalFragmentBudget, ...source.environmentalFragmentBudget },
    gpuComputeBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.gpuComputeBudget, ...source.gpuComputeBudget,
      credits: { ...RENDER_ENHANCEMENT_DEFAULTS.gpuComputeBudget.credits, ...source.gpuComputeBudget?.credits },
      maxDeferralMs: { ...RENDER_ENHANCEMENT_DEFAULTS.gpuComputeBudget.maxDeferralMs, ...source.gpuComputeBudget?.maxDeferralMs } },
    environmentalParticleBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.environmentalParticleBudget, ...source.environmentalParticleBudget,
      minimumShares: { ...RENDER_ENHANCEMENT_DEFAULTS.environmentalParticleBudget.minimumShares, ...source.environmentalParticleBudget?.minimumShares } },
    townDecorationBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.townDecorationBudget, ...source.townDecorationBudget },
    auxiliaryPassBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.auxiliaryPassBudget, ...source.auxiliaryPassBudget },
    surfaceAnisotropy: { ...RENDER_ENHANCEMENT_DEFAULTS.surfaceAnisotropy, ...source.surfaceAnisotropy },
    waterReflections: { ...RENDER_ENHANCEMENT_DEFAULTS.waterReflections, ...source.waterReflections } };
  const params = new URLSearchParams(search);
  if (source.r187 !== undefined && (!source.r187 || typeof source.r187 !== 'object' || Array.isArray(source.r187))) {
    throw new TypeError('r187 must be an object.');
  }
  for (const [param, key] of [['r187DepthOnlyOcclusion', 'depthOnlyOcclusion'], ['r187PrioritizedRequests', 'prioritizedRequests']]) {
    if (params.has(param)) value.r187[key] = params.get(param) === '1';
    if (typeof value.r187[key] !== 'boolean') throw new TypeError(`r187.${key} must be a boolean.`);
  }
  const { maxConcurrentRequests, maxConcurrentDecodes, requestMaxWaitMs } = value.r187;
  if (!Number.isInteger(maxConcurrentRequests) || maxConcurrentRequests < 1 || maxConcurrentRequests > 16) {
    throw new RangeError('r187.maxConcurrentRequests must be an integer in [1, 16].');
  }
  if (!Number.isInteger(maxConcurrentDecodes) || maxConcurrentDecodes < 1 || maxConcurrentDecodes > 16) {
    throw new RangeError('r187.maxConcurrentDecodes must be an integer in [1, 16].');
  }
  if (!Number.isFinite(requestMaxWaitMs) || requestMaxWaitMs < 0) throw new RangeError('r187.requestMaxWaitMs must be non-negative.');
  if (params.get('enhancements') === 'high') {
    value.waterReflections.enabled = true;
    value.waterReflections.planar = true;
    value.waterReflections.resolution = Math.max(256, value.waterReflections.resolution);
    value.waterReflections.intervalMs = Math.min(250, value.waterReflections.intervalMs);
    value.shadowCascades = 2;
    value.roadsideLanterns = true;
  }
  for (const [parameter, key] of [['locationSurfaceTerrainBakeReclamation', 'surfaceTerrainBakeReclamationEnabled'],
    ['locationSurfaceOceanFftReclamation', 'surfaceOceanFftReclamationEnabled'],
    ['locationSurfaceReflectionReclamation', 'surfaceReflectionReclamationEnabled'],
    ['locationSurfaceAdaptiveReclamation', 'surfaceAdaptiveReclamationEnabled'],
    ['locationSurfaceExitWarmup', 'surfaceExitWarmupEnabled'],
    ['locationSurfaceShadowWarmup', 'surfaceShadowWarmupEnabled'],
    ['locationSurfacePostWarmup', 'surfacePostWarmupEnabled'],
    ['locationSurfaceAtmosphereWarmup', 'surfaceAtmosphereWarmupEnabled'],
    ['locationSurfaceEnvironmentWarmup', 'surfaceEnvironmentWarmupEnabled'],
    ['locationSurfaceOceanFftWarmup', 'surfaceOceanFftWarmupEnabled'],
    ['locationSurfaceOceanFftWarmupCompute', 'surfaceOceanFftWarmupComputeEnabled'],
    ['locationSurfaceReflectionWarmup', 'surfaceReflectionWarmupEnabled'],
    ['locationSurfacePostReclamation', 'surfacePostReclamationEnabled'],
    ['locationSurfaceAtmosphereReclamation', 'surfaceAtmosphereReclamationEnabled'],
    ['locationSurfaceShadowReclamation', 'surfaceShadowReclamationEnabled'],
    ['locationSurfaceEnvironmentReclamation', 'surfaceEnvironmentReclamationEnabled']]) {
    if (params.has(parameter)) value.locationStructureBudget[key] = params.get(parameter) === '1';
  }
  if (params.has('locationSurfaceTownReclamation')) value.locationStructureBudget.surfaceTownReclamationEnabled = params.get('locationSurfaceTownReclamation') === '1';
  if (params.has('locationSurfaceGpuImpostorReclamation')) value.locationStructureBudget.surfaceGpuImpostorReclamationEnabled = params.get('locationSurfaceGpuImpostorReclamation') === '1';
  if (params.has('locationSurfaceSceneryReclamation')) value.locationStructureBudget.surfaceSceneryReclamationEnabled = params.get('locationSurfaceSceneryReclamation') === '1';
  if (params.has('locationSurfaceMeadowReclamation')) value.locationStructureBudget.surfaceMeadowReclamationEnabled = params.get('locationSurfaceMeadowReclamation') === '1';
  if (params.has('locationSurfaceReclamation')) value.locationStructureBudget.surfaceReclamationEnabled = params.get('locationSurfaceReclamation') === '1';
  if (params.has('locationIncrementalLighting')) value.locationStructureBudget.lightingEnabled = params.get('locationIncrementalLighting') === '1';
  if (params.has('locationIncrementalGeneration')) value.locationStructureBudget.generationEnabled = params.get('locationIncrementalGeneration') === '1';
  if (params.has('locationGenerationWorker')) value.locationStructureBudget.generationWorker = params.get('locationGenerationWorker') === '1';
  if (params.has('locationPortalVisibility')) value.locationStructureBudget.portalEnabled = params.get('locationPortalVisibility') === '1';
  if (params.has('locationPortalCull')) value.locationStructureBudget.portalCull = params.get('locationPortalCull') === '1';
  if (params.has('locationStructurePrefetch')) value.locationStructureBudget.prefetchEnabled = params.get('locationStructurePrefetch') === '1';
  if (params.has('detailVisibility')) value.detailVisibility = params.get('detailVisibility') === '1';
  for (const key of ['snowRelief', 'roadsideLanterns', 'crownShadows', 'oceanFft', 'geologyLod', 'regionalGeologyAdmission', 'locationDecorationAdmission', 'locationStructureStreaming', 'regionalTerrainProfiles', 'regionalLazyTrees', 'regionalTreeSourceRelease', 'regionalResourceBudget', 'regionalDensityBudget', 'regionalSpatialBudget', 'regionalGeometryCostBudget', 'spatialPerformanceOverlay', 'regionalAdmissionBudget', 'rendererAdmissionBudget', 'regionalInstancePublicationBudget', 'slicedInstancePublication', 'initialInstanceUploadSlicing', 'renderLayerIsolation', 'gpuComputeAdmission', 'farShadowAdmission', 'reflectionAdmission', 'townDecorationAdmission', 'environmentalParticleAdmission', 'environmentalFragmentAdmission', 'coastalSprayCompaction', 'atmosphericPassAdmission', 'measuredGpuAdmission']) if (params.has(key)) value[key] = params.get(key) === '1';
  if (params.has('waterCube')) value.waterReflections.enabled = params.get('waterCube') === '1';
  if (params.has('waterPlanar')) value.waterReflections.planar = params.get('waterPlanar') === '1';
  if (params.has('shadowCascades')) value.shadowCascades = Number(params.get('shadowCascades'));
  for (const key of ['detailVisibility', 'snowRelief', 'roadsideLanterns', 'crownShadows', 'oceanFft', 'geologyLod', 'regionalGeologyAdmission', 'locationDecorationAdmission', 'locationStructureStreaming', 'regionalTerrainProfiles', 'regionalLazyTrees', 'regionalTreeSourceRelease', 'regionalResourceBudget', 'regionalDensityBudget', 'regionalSpatialBudget', 'regionalGeometryCostBudget', 'spatialPerformanceOverlay', 'regionalAdmissionBudget', 'rendererAdmissionBudget', 'regionalInstancePublicationBudget', 'slicedInstancePublication', 'initialInstanceUploadSlicing', 'renderLayerIsolation', 'gpuComputeAdmission', 'farShadowAdmission', 'reflectionAdmission', 'townDecorationAdmission', 'environmentalParticleAdmission', 'environmentalFragmentAdmission', 'coastalSprayCompaction', 'atmosphericPassAdmission', 'measuredGpuAdmission']) {
    if (typeof value[key] !== 'boolean') throw new TypeError(`${key} must be a boolean.`);
  }
  for (const key of ['enabled', 'planar', 'roughnessFiltering']) if (typeof value.waterReflections[key] !== 'boolean') throw new TypeError(`waterReflections.${key} must be a boolean.`);
  if (![1, 2].includes(value.shadowCascades)) throw new RangeError('shadowCascades must be 1 or 2.');
  if (!Number.isFinite(value.detailTurnMarginDegrees) || value.detailTurnMarginDegrees < 8 || value.detailTurnMarginDegrees > 45) {
    throw new RangeError('detailTurnMarginDegrees must be within [8, 45] to cover pending camera turns.');
  }
  for (const [key, min, max] of [['idleMs', 1000, 300000], ['maxTrackedTextureMiB', 16, 8192], ['maxRendererMiB', 128, 32768], ['evictionsPerFrame', 1, 8], ['farGrassPressure', 0.1, 1], ['sceneryLodPressure', 0.5, 1], ['protectedChunkRadius', 1, 8], ['spatialChunkRadius', 2, 16], ['spatialChunkBudget', 1, 1000000], ['spatialLodFactor', 0.5, 1], ['spatialCardFactor', 0.5, 1], ['spatialWorkItems', 16, 2048], ['spatialTriangleBudget', 1000, 100000000], ['spatialDrawBudget', 1, 10000], ['spatialReflectionPassWeight', 0, 1], ['rendererAdmissionTriangleBudget', 1000, 100000000], ['rendererAdmissionDrawBudget', 1, 100000], ['rendererAdmissionTransitionReserve', 0, 0.5], ['rendererAdmissionUploadHeadroom', 0, 1], ['rendererAdmissionMaxChanges', 1, 64], ['sampleIntervalMs', 250, 10000], ['triangleBudget', 100000, 100000000], ['drawBudget', 50, 20000], ['townInstanceBudget', 100, 100000], ['recoveryRatio', 0.1, 0.99]]) {
    const n = value.regionalBudget[key];
    if (!Number.isFinite(n) || n < min || n > max || (['evictionsPerFrame', 'protectedChunkRadius', 'spatialChunkRadius', 'spatialWorkItems', 'rendererAdmissionMaxChanges'].includes(key) && !Number.isInteger(n))) throw new RangeError(`regionalBudget.${key} must be in [${min}, ${max}].`);
  }
  for (const [key, weight] of Object.entries(value.regionalBudget.spatialWeights)) {
    if (!Object.hasOwn(RENDER_ENHANCEMENT_DEFAULTS.regionalBudget.spatialWeights, key)
        || !Number.isFinite(weight) || weight < 0 || weight > 10000) throw new RangeError(`Invalid regionalBudget.spatialWeights.${key}.`);
  }
  const factors = value.regionalBudget.admissionFactors;
  if (!Array.isArray(factors) || factors.length < 2 || factors.length > 8 || factors[0] !== 1
      || factors.some((factor, i) => !Number.isFinite(factor) || factor < 0.5 || factor > 1 || (i > 0 && factor >= factors[i - 1]))) {
    throw new RangeError('regionalBudget.admissionFactors must descend from 1 to at least 0.5, with 2–8 entries.');
  }
  for (const [key, priority] of Object.entries(value.regionalBudget.admissionPriorities)) {
    if (!Object.hasOwn(RENDER_ENHANCEMENT_DEFAULTS.regionalBudget.admissionPriorities, key)
        || !Number.isFinite(priority) || priority < 0 || priority > 100) throw new RangeError(`Invalid regionalBudget.admissionPriorities.${key}.`);
  }
  for (const [block, ranges] of Object.entries({ geologyAdmissionBudget: { triangleBudget: [1000, 10000000], protectMeters: [48, 512], minimumScaleMultiplier: [12, 45], maxExtraDraws: [0, 128], recoveryRatio: [0.1, 1] },
    locationStructureBudget: { cellMeters: [8, 128], minPropTriangles: [1, 100000], protectMeters: [16, 512], idleMs: [1000, 60000], sampleMs: [100, 2000], evictionsPerSample: [1, 16],
      prefetchExtraMeters: [0, 128], prefetchLookaheadMs: [0, 5000], prefetchMaxLeadMeters: [0, 128],
      prefetchSliceBytes: [4096, 4194304], prefetchMaxDetachedBytes: [4096, 67108864], prefetchMaxAllocationsPerFrame: [1, 16], prefetchMaxMs: [0.1, 8],
      portalCellMeters: [4, 64], portalMaxCells: [1, 65536], portalMaxSampleReads: [1000, 64000000],
      generationSliceMs: [0.5, 16], generationMaxCopyBytes: [0, 268435456], generationWorkerTimeoutMs: [1000, 300000], lightingSliceMs: [0.5, 16],
      surfaceMeadowProtectMeters: [0, 2048], surfaceSceneryProtectMeters: [0, 2048], surfaceTownProtectMeters: [0, 2048], surfaceProtectMeters: [0, 2048], surfaceIdleMs: [1000, 60000], surfaceSampleMs: [100, 5000],
      surfaceOceanFftWarmupMaxBytes: [0, 536870912], surfaceReflectionWarmupMaxBytes: [0, 536870912], surfaceWaterWarmupMeters: [1, 2048],
      surfaceEnvironmentWarmupMaxBytes: [0, 536870912],
      surfaceAtmosphereWarmupMaxBytes: [0, 536870912], surfaceAtmosphereWarmupMaxTargetBytes: [0, 268435456],
      surfaceTargetWarmupMaxBytes: [0, 536870912], surfacePostWarmupMaxBytes: [0, 536870912], surfacePostWarmupMaxTargetBytes: [0, 268435456],
      surfaceShadowWarmupMaxBytes: [0, 536870912], surfaceShadowWarmupMaxTargetBytes: [0, 268435456],
      surfaceExitWarmupMeters: [1, 128], surfaceExitWarmupSampleMs: [100, 5000], surfaceExitWarmupMaxBytes: [0, 268435456],
      surfaceAdaptiveHighMiB: [64, 32768], surfaceAdaptiveLowMiB: [32, 32768], surfaceAdaptiveMaxMiB: [1, 4096], surfaceAdaptiveDeferredCost: [1, 32], surfaceAdaptiveImpostorCost: [1, 32],
      surfaceEvictionsPerSample: [1, 32], surfaceMaxEvictedBytes: [0, 268435456], surfaceRestoreBytesPerFrame: [4096, 16777216], surfaceRestoresPerFrame: [1, 32] },
    locationDecorationBudget: { cellMeters: [8, 128], protectMeters: [8, 128], maxDistanceMeters: [24, 512], triangleBudget: [1000, 10000000], drawBudget: [1, 256], recoveryMeters: [0, 16], boundsPaddingMeters: [0.1, 8], refreshMeters: [0.25, 4] } })) {
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const n = value[block][key];
      if (!Number.isFinite(n) || n < min || n > max || (['triangleBudget', 'drawBudget', 'maxExtraDraws'].includes(key) && !Number.isInteger(n))) throw new RangeError(`${block}.${key} must be in [${min}, ${max}].`);
    }
  }
  if (value.locationStructureBudget.protectMeters < value.locationStructureBudget.cellMeters || !Number.isInteger(value.locationStructureBudget.evictionsPerSample) || !Number.isInteger(value.locationStructureBudget.minPropTriangles)) throw new RangeError('Invalid location structure protection or integer budget.');
  const structure = value.locationStructureBudget;
  for (const key of ['portalEnabled', 'portalCull', 'generationEnabled', 'generationWorker', 'lightingEnabled', 'surfaceReclamationEnabled', 'surfaceMeadowReclamationEnabled', 'surfaceSceneryReclamationEnabled', 'surfaceGpuImpostorReclamationEnabled', 'surfaceTownReclamationEnabled', 'surfaceTerrainBakeReclamationEnabled', 'surfaceOceanFftReclamationEnabled', 'surfaceReflectionReclamationEnabled', 'surfacePostReclamationEnabled', 'surfaceAtmosphereReclamationEnabled', 'surfaceShadowReclamationEnabled', 'surfaceEnvironmentReclamationEnabled', 'surfaceAdaptiveReclamationEnabled', 'surfaceExitWarmupEnabled', 'surfaceShadowWarmupEnabled', 'surfacePostWarmupEnabled', 'surfaceAtmosphereWarmupEnabled', 'surfaceEnvironmentWarmupEnabled', 'surfaceOceanFftWarmupEnabled', 'surfaceOceanFftWarmupComputeEnabled', 'surfaceReflectionWarmupEnabled']) if (typeof structure[key] !== 'boolean') throw new TypeError(`locationStructureBudget.${key} must be a boolean.`);
  for (const key of ['portalMaxCells', 'portalMaxSampleReads', 'generationMaxCopyBytes', 'generationWorkerTimeoutMs', 'surfaceEvictionsPerSample', 'surfaceMaxEvictedBytes', 'surfaceRestoreBytesPerFrame', 'surfaceRestoresPerFrame', 'surfaceExitWarmupMaxBytes', 'surfaceShadowWarmupMaxBytes', 'surfaceShadowWarmupMaxTargetBytes', 'surfaceTargetWarmupMaxBytes', 'surfacePostWarmupMaxBytes', 'surfacePostWarmupMaxTargetBytes', 'surfaceAtmosphereWarmupMaxBytes', 'surfaceAtmosphereWarmupMaxTargetBytes', 'surfaceEnvironmentWarmupMaxBytes', 'surfaceOceanFftWarmupMaxBytes', 'surfaceReflectionWarmupMaxBytes']) if (!Number.isInteger(structure[key])) throw new RangeError(`locationStructureBudget.${key} must be an integer.`);
  if (structure.surfaceAdaptiveLowMiB >= structure.surfaceAdaptiveHighMiB) throw new RangeError('Adaptive surface recovery threshold must be below the pressure threshold.');
  if (typeof structure.prefetchEnabled !== 'boolean') throw new TypeError('locationStructureBudget.prefetchEnabled must be a boolean.');
  if (!Number.isInteger(structure.prefetchSliceBytes) || structure.prefetchSliceBytes % 4 !== 0
      || !Number.isInteger(structure.prefetchMaxDetachedBytes) || structure.prefetchMaxDetachedBytes % 4 !== 0
      || !Number.isInteger(structure.prefetchMaxAllocationsPerFrame) || structure.prefetchMaxDetachedBytes < structure.prefetchSliceBytes) {
    throw new RangeError('Invalid location structure prefetch upload budget.');
  }
  if (value.locationDecorationBudget.maxDistanceMeters < value.locationDecorationBudget.protectMeters + value.locationDecorationBudget.recoveryMeters + value.locationDecorationBudget.refreshMeters) throw new RangeError('Location decoration reach must cover the protected area.');
  for (const [key, min, max] of [['refreshMs', 250, 10000], ['radius', 2, 16]]) {
    const n = value.spatialOverlay[key];
    if (!Number.isInteger(n) || n < min || n > max) throw new RangeError(`spatialOverlay.${key} must be in [${min}, ${max}].`);
  }
  for (const [key, min, max] of [['sliceBytes', 4096, 4194304], ['maxStagingBytes', 4096, 67108864], ['maxCopyRanges', 1, 32768], ['maxWritesPerSlice', 1, 256]]) {
    const n = value.instanceSliceBudget[key];
    if (!Number.isInteger(n) || n < min || n > max || (key.endsWith('Bytes') && n % 4 !== 0)) throw new RangeError(`instanceSliceBudget.${key} must be in [${min}, ${max}].`);
  }
  if (value.instanceSliceBudget.maxStagingBytes < value.instanceSliceBudget.sliceBytes) throw new RangeError('Instance staging must accommodate one slice.');
  for (const [key, min, max] of [['sliceBytes', 4096, 4194304], ['maxDetachedBytes', 4096, 134217728], ['maxAllocationsPerFrame', 1, 16], ['maxRestarts', 0, 16], ['handoffTimeoutMs', 1, 30000]]) {
    const n = value.initialInstanceUploadBudget[key];
    if (!Number.isInteger(n) || n < min || n > max || (key.endsWith('Bytes') && n % 4 !== 0)) throw new RangeError(`initialInstanceUploadBudget.${key} must be in [${min}, ${max}].`);
  }
  if (value.initialInstanceUploadBudget.maxDetachedBytes < value.initialInstanceUploadBudget.sliceBytes) throw new RangeError('Initial instance staging must accommodate one slice.');
  const gpu = value.gpuAdmissionBudget;
  for (const [key, min, max] of [['sampleEvery', 2, 120], ['maxAgeMs', 250, 10000], ['targetRenderMs', 2, 100], ['recoveryRenderMs', 1, 100], ['pressureSamples', 2, 20], ['recoverySamples', 2, 60], ['minimumDwellMs', 250, 30000]]) {
    const n = gpu[key];
    if (!Number.isFinite(n) || n < min || n > max || (['sampleEvery', 'pressureSamples', 'recoverySamples'].includes(key) && !Number.isInteger(n))) throw new RangeError(`gpuAdmissionBudget.${key} must be in [${min}, ${max}].`);
  }
  if (gpu.recoveryRenderMs >= gpu.targetRenderMs) throw new RangeError('GPU admission recovery must be below its target.');
  for (const [key, n] of Object.entries(gpu.passMs)) if (!Object.hasOwn(RENDER_ENHANCEMENT_DEFAULTS.gpuAdmissionBudget.passMs, key) || !Number.isFinite(n) || n < 0.1 || n > 100) throw new RangeError(`Invalid GPU pass budget: ${key}.`);
  for (const [key, n] of Object.entries(gpu.auxiliaryPassMs)) if (!Object.hasOwn(RENDER_ENHANCEMENT_DEFAULTS.gpuAdmissionBudget.auxiliaryPassMs, key) || !Number.isFinite(n) || n < 0.1 || n > 100) throw new RangeError(`Invalid auxiliary GPU pass budget: ${key}.`);
  const compute = value.gpuComputeBudget;
  for (const [key, min, max] of [['frameCredits', 1, 10000], ['mandatoryReserveCredits', 0, 10000], ['maxFrameGapMs', 100, 2000]]) {
    if (!Number.isFinite(compute[key]) || compute[key] < min || compute[key] > max) throw new RangeError(`gpuComputeBudget.${key} must be in [${min}, ${max}].`);
  }
  if (compute.mandatoryReserveCredits > compute.frameCredits) throw new RangeError('GPU compute reserve exceeds frame credits.');
  for (const [key, n] of Object.entries(compute.credits)) if (!Object.hasOwn(RENDER_ENHANCEMENT_DEFAULTS.gpuComputeBudget.credits, key) || !Number.isFinite(n) || n <= 0 || n > 1000) throw new RangeError(`Invalid GPU compute credits: ${key}.`);
  for (const [key, n] of Object.entries(compute.maxDeferralMs)) if (!Object.hasOwn(RENDER_ENHANCEMENT_DEFAULTS.gpuComputeBudget.maxDeferralMs, key) || !Number.isFinite(n) || n < 0 || n > compute.maxFrameGapMs || (key === 'snow' && n > 60)) throw new RangeError(`Invalid GPU compute deferral: ${key}.`);
  const atmosphere = value.atmosphericPassBudget;
  for (const [key, min, max] of [['targetFrameMs', 5, 100], ['recoveryFrameMs', 4, 100], ['pressureMs', 100, 5000], ['recoveryMs', 500, 20000], ['minimumDwellMs', 500, 30000], ['maxFrameGapMs', 100, 2000], ['ssrStepFactor', 0.25, 1], ['ssrMinimumSteps', 1, 64], ['shaftSampleFactor', 0.25, 1], ['shaftMinimumSamples', 1, 48], ['volumetricStepFactor', 0.25, 1], ['volumetricMinimumSteps', 1, 128], ['aoResolutionFactor', 0.5, 1], ['aoMinimumResolution', 0.25, 1]]) {
    if (!Number.isFinite(atmosphere[key]) || atmosphere[key] < min || atmosphere[key] > max || (['ssrMinimumSteps', 'shaftMinimumSamples', 'volumetricMinimumSteps'].includes(key) && !Number.isInteger(atmosphere[key]))) throw new RangeError(`atmosphericPassBudget.${key} must be in [${min}, ${max}].`);
  }
  if (typeof atmosphere.reduceBloomFilter !== 'boolean') throw new TypeError('atmosphericPassBudget.reduceBloomFilter must be boolean.');
  if (atmosphere.recoveryFrameMs >= atmosphere.targetFrameMs || atmosphere.targetFrameMs >= atmosphere.maxFrameGapMs) throw new RangeError('Atmospheric pass frame thresholds must be ordered.');
  const fragments = value.environmentalFragmentBudget;
  for (const [key, min, max] of [['fogStepFactor', 0.25, 1], ['fogMinimumSteps', 1, 12], ['fogProtectedDistanceMeters', 0, 128],
    ['frameCpuPressureMs', 1, 100], ['recoveryMs', 0, 10000], ['transparentAlphaCutoff', 0, 0.01]]) {
    if (!Number.isFinite(fragments[key]) || fragments[key] < min || fragments[key] > max || (key === 'fogMinimumSteps' && !Number.isInteger(fragments[key]))) throw new RangeError(`environmentalFragmentBudget.${key} must be in [${min}, ${max}].`);
  }
  const particles = value.environmentalParticleBudget;
  for (const [key, min, max] of [['particleBudget', 100, 1000000], ['pressureFactor', 0.1, 1], ['frameCpuPressureMs', 1, 100],
    ['sampleMs', 16, 2000], ['recoveryMs', 0, 10000], ['protectWaterfallMeters', 0, 300]]) {
    if (!Number.isFinite(particles[key]) || particles[key] < min || particles[key] > max) throw new RangeError(`environmentalParticleBudget.${key} must be in [${min}, ${max}].`);
  }
  for (const [key, share] of Object.entries(particles.minimumShares)) {
    if (!Object.hasOwn(RENDER_ENHANCEMENT_DEFAULTS.environmentalParticleBudget.minimumShares, key) || !Number.isFinite(share) || share < 0 || share > 1) throw new RangeError(`Invalid environmental particle minimum share: ${key}.`);
  }
  const decorations = value.townDecorationBudget;
  for (const [key, min, max] of [['triangleBudget', 1000, 10000000], ['drawBudget', 1, 1000], ['protectMeters', 36, 320],
    ['omitDistanceMeters', 100, 1000], ['refreshMeters', 1, 16], ['recoveryRatio', 0.1, 1]]) {
    const n = decorations[key];
    if (!Number.isFinite(n) || n < min || n > max || (['triangleBudget', 'drawBudget'].includes(key) && !Number.isInteger(n))) throw new RangeError(`townDecorationBudget.${key} must be in [${min}, ${max}].`);
  }
  if (decorations.omitDistanceMeters < decorations.protectMeters + decorations.refreshMeters) throw new RangeError('Town decoration omission must be beyond the protected area.');
  const auxiliary = value.auxiliaryPassBudget;
  for (const [key, min, max] of [['farShadowIntervalMs', 0, 500], ['farShadowMaxAgeMs', 0, 1000],
    ['farShadowMoveMeters', 0, 5], ['farShadowTurnDegrees', 0, 10], ['farShadowSunDegrees', 0, 2],
    ['frameCpuPressureMs', 1, 100], ['cubeCaptureCpuBudgetMs', 0.25, 20], ['planarCaptureCpuBudgetMs', 0.25, 20],
    ['reflectionUrgentDeferralMs', 0, 1000], ['reflectionMaxDeferralMs', 0, 2000]]) {
    if (!Number.isFinite(auxiliary[key]) || auxiliary[key] < min || auxiliary[key] > max) throw new RangeError(`auxiliaryPassBudget.${key} must be in [${min}, ${max}].`);
  }
  if (auxiliary.farShadowIntervalMs > auxiliary.farShadowMaxAgeMs || auxiliary.reflectionUrgentDeferralMs > auxiliary.reflectionMaxDeferralMs) throw new RangeError('Auxiliary pass freshness limits are inverted.');
  const water = value.waterReflections;
  if (![128, 256, 512].includes(water.resolution)) throw new RangeError('Reflection resolution must be 128, 256 or 512.');
  for (const [key, min, max] of [
    ['intervalMs', 100, 5000],
    ['reachMeters', 16, 256],
    ['captureSafetyFactor', 1, 3],
    ['initialCaptureCpuMs', 0.25, 10],
    ['maxCaptureDeferralMs', 0, 1000],
  ]) {
    if (!Number.isFinite(water[key]) || water[key] < min || water[key] > max) throw new RangeError(`waterReflections.${key} must be in [${min}, ${max}].`);
  }
  if (!Number.isInteger(water.captureFrameStride) || water.captureFrameStride < 1 || water.captureFrameStride > 16) {
    throw new RangeError('waterReflections.captureFrameStride must be an integer in [1, 16].');
  }
  if (mobile) { value.shadowCascades = 1; water.enabled = false; water.planar = false;
    value.surfaceAnisotropy.level = Math.min(4, value.surfaceAnisotropy.level); }
  return value;
}
