export const RENDER_ENHANCEMENT_DEFAULTS = Object.freeze({
  detailVisibility: false, shadowCascades: 1, snowRelief: true, roadsideLanterns: false,
  waterReflections: Object.freeze({
    enabled: false,
    planar: false,
    resolution: 256,
    intervalMs: 250,
    reachMeters: 96,
    captureFrameStride: 4,
    captureSafetyFactor: 1.25,
    initialCaptureCpuMs: 2,
  }),
});

export function resolveRenderEnhancements(source = {}, search = '', { mobile = false } = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('Render enhancements must be an object.');
  const value = { ...RENDER_ENHANCEMENT_DEFAULTS, ...source,
    waterReflections: { ...RENDER_ENHANCEMENT_DEFAULTS.waterReflections, ...source.waterReflections } };
  const params = new URLSearchParams(search);
  if (params.get('enhancements') === 'high') {
    value.waterReflections.enabled = true;
    value.waterReflections.planar = true;
    value.shadowCascades = 2;
    value.roadsideLanterns = true;
  }
  if (params.has('detailVisibility')) value.detailVisibility = params.get('detailVisibility') === '1';
  for (const key of ['snowRelief', 'roadsideLanterns']) if (params.has(key)) value[key] = params.get(key) === '1';
  if (params.has('waterCube')) value.waterReflections.enabled = params.get('waterCube') === '1';
  if (params.has('waterPlanar')) value.waterReflections.planar = params.get('waterPlanar') === '1';
  if (params.has('shadowCascades')) value.shadowCascades = Number(params.get('shadowCascades'));
  for (const key of ['detailVisibility', 'snowRelief', 'roadsideLanterns']) {
    if (typeof value[key] !== 'boolean') throw new TypeError(`${key} must be a boolean.`);
  }
  for (const key of ['enabled', 'planar']) if (typeof value.waterReflections[key] !== 'boolean') throw new TypeError(`waterReflections.${key} must be a boolean.`);
  if (![1, 2].includes(value.shadowCascades)) throw new RangeError('shadowCascades must be 1 or 2.');
  const water = value.waterReflections;
  if (![128, 256, 512].includes(water.resolution)) throw new RangeError('Reflection resolution must be 128, 256 or 512.');
  for (const [key, min, max] of [
    ['intervalMs', 100, 5000],
    ['reachMeters', 16, 256],
    ['captureSafetyFactor', 1, 3],
    ['initialCaptureCpuMs', 0.25, 10],
  ]) {
    if (!Number.isFinite(water[key]) || water[key] < min || water[key] > max) throw new RangeError(`waterReflections.${key} must be in [${min}, ${max}].`);
  }
  if (!Number.isInteger(water.captureFrameStride) || water.captureFrameStride < 1 || water.captureFrameStride > 16) {
    throw new RangeError('waterReflections.captureFrameStride must be an integer in [1, 16].');
  }
  if (mobile) { value.shadowCascades = 1; water.enabled = false; water.planar = false; }
  return value;
}
