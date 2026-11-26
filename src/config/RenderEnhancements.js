export const RENDER_ENHANCEMENT_DEFAULTS = Object.freeze({
  detailVisibility: false, detailTurnMarginDegrees: 12, shadowCascades: 1, snowRelief: true, roadsideLanterns: false,
  // Near-band tree crowns cast sun shadows. Off: the cost and the crowns' own self-shadowing are unmeasured.
  crownShadows: false,
  // QA override of water.sea.offshoreFft.enabled (PR I): `?oceanFft=1` forces the offshore FFT on.
  oceanFft: false,
  geologyLod: false,
  regionalTerrainProfiles: false,
  regionalLazyTrees: false,
  regionalTreeSourceRelease: false,
  regionalResourceBudget: false,
  regionalDensityBudget: false,
  regionalSpatialBudget: false,
  regionalGeometryCostBudget: false,
  regionalAdmissionBudget: false,
  rendererAdmissionBudget: false,
  regionalInstancePublicationBudget: false,
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
    regionalBudget: { ...RENDER_ENHANCEMENT_DEFAULTS.regionalBudget, ...source.regionalBudget,
      spatialWeights: { ...RENDER_ENHANCEMENT_DEFAULTS.regionalBudget.spatialWeights, ...source.regionalBudget?.spatialWeights },
      admissionPriorities: { ...RENDER_ENHANCEMENT_DEFAULTS.regionalBudget.admissionPriorities, ...source.regionalBudget?.admissionPriorities } },
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
  if (params.has('detailVisibility')) value.detailVisibility = params.get('detailVisibility') === '1';
  for (const key of ['snowRelief', 'roadsideLanterns', 'crownShadows', 'oceanFft', 'geologyLod', 'regionalTerrainProfiles', 'regionalLazyTrees', 'regionalTreeSourceRelease', 'regionalResourceBudget', 'regionalDensityBudget', 'regionalSpatialBudget', 'regionalGeometryCostBudget', 'regionalAdmissionBudget', 'rendererAdmissionBudget', 'regionalInstancePublicationBudget']) if (params.has(key)) value[key] = params.get(key) === '1';
  if (params.has('waterCube')) value.waterReflections.enabled = params.get('waterCube') === '1';
  if (params.has('waterPlanar')) value.waterReflections.planar = params.get('waterPlanar') === '1';
  if (params.has('shadowCascades')) value.shadowCascades = Number(params.get('shadowCascades'));
  for (const key of ['detailVisibility', 'snowRelief', 'roadsideLanterns', 'crownShadows', 'oceanFft', 'geologyLod', 'regionalTerrainProfiles', 'regionalLazyTrees', 'regionalTreeSourceRelease', 'regionalResourceBudget', 'regionalDensityBudget', 'regionalSpatialBudget', 'regionalGeometryCostBudget', 'regionalAdmissionBudget', 'rendererAdmissionBudget', 'regionalInstancePublicationBudget']) {
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
