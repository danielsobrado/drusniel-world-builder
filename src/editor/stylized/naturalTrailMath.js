const DEFAULTS = Object.freeze({
  enabled: false,
  scale: 0.018,
  level: 0.08,
  width: 0.038,
  softness: 0.035,
  warp: 0.9,
  clearThreshold: 0.42,
});

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeNaturalTrailConfig(config = {}) {
  return {
    enabled: config.enabled === true,
    scale: Math.max(0.000001, finiteOr(config.scale, DEFAULTS.scale)),
    level: finiteOr(config.level, DEFAULTS.level),
    width: Math.max(0.000001, finiteOr(config.width, DEFAULTS.width)),
    softness: Math.max(0.000001, finiteOr(config.softness, DEFAULTS.softness)),
    warp: finiteOr(config.warp, DEFAULTS.warp),
    clearThreshold: Math.min(1, Math.max(
      0,
      finiteOr(config.clearThreshold, DEFAULTS.clearThreshold),
    )),
  };
}

/**
 * A continuous world-space contour field for decorative game trails.
 *
 * Unlike thresholded noise blobs, an iso-contour stays connected for long
 * distances. The same inexpensive expression is mirrored in the TSL materials
 * so streamed chunks and CPU prop placement agree without storing another map.
 */
export function naturalTrailFieldAt(worldX, worldZ, config = {}) {
  return fieldAt(worldX,worldZ,normalizeNaturalTrailConfig(config));
}

// The materials wrap chunk centres to this period (StylizedNoiseNodes); the
// whole coordinate is wrapped here so CPU placement sees the same contour.
const NOISE_WRAP_METRES = 65536;
const wrap = (value) => value - Math.floor(value / NOISE_WRAP_METRES + 0.5) * NOISE_WRAP_METRES;

function fieldAt(worldX,worldZ,settings) {
  const x = wrap(worldX) * settings.scale;
  const z = wrap(worldZ) * settings.scale;
  const warpedX = x + Math.sin(z * 0.73 + 1.7) * settings.warp;
  const warpedZ = z + Math.sin(x * 0.61 - 2.3) * settings.warp;
  return Math.sin(warpedX) * 0.52
    + Math.sin(warpedZ * 0.83 + 1.1) * 0.33
    + Math.sin((warpedX + warpedZ) * 0.47 - 0.6) * 0.15;
}

/** Analytic gradient in field coordinates; divide by it to obtain path width
 * in space rather than letting low-gradient areas become broad bare plazas. */
function gradientAt(worldX, worldZ, settings) {
  const x = wrap(worldX) * settings.scale, z = wrap(worldZ) * settings.scale;
  const u = x + Math.sin(z * 0.73 + 1.7) * settings.warp;
  const v = z + Math.sin(x * 0.61 - 2.3) * settings.warp;
  const shared = Math.cos((u + v) * 0.47 - 0.6) * 0.0705;
  const du = Math.cos(u) * 0.52 + shared;
  const dv = Math.cos(v * 0.83 + 1.1) * 0.2739 + shared;
  return { x: du + dv * Math.cos(x * 0.61 - 2.3) * settings.warp * 0.61,
    z: dv + du * Math.cos(z * 0.73 + 1.7) * settings.warp * 0.73 };
}

export function naturalTrailGradientAt(x, z, config = {}) {
  const settings = normalizeNaturalTrailConfig(config);
  const gradient = gradientAt(x, z, settings);
  return { x: gradient.x * settings.scale, z: gradient.z * settings.scale };
}

export function naturalTrailGradientBound(settings) {
  const warp = Math.abs(settings.warp);
  return .52 * (1 + .73 * warp) + .2739 * (1 + .61 * warp) + .0705 * (2 + 1.34 * warp);
}

function contourDistanceAt(x, z, settings) {
  const gradient = gradientAt(x, z, settings);
  // Bounded at critical points, where the first-order distance approximation
  // ceases to be reliable. The identical guard lives in the TSL path mask.
  return Math.abs(fieldAt(x, z, settings) - settings.level) / Math.max(.08, Math.hypot(gradient.x, gradient.z));
}

export function naturalTrailMaskAt(worldX, worldZ, config = {}) {
  return maskAt(worldX,worldZ,normalizeNaturalTrailConfig(config));
}

function maskAt(worldX,worldZ,settings) {
  if (!settings.enabled) return 0;
  const distance = contourDistanceAt(worldX, worldZ, settings);
  const transition = Math.min(1, Math.max(
    0,
    (distance - settings.width) / settings.softness,
  ));
  const smoothTransition = transition * transition * (3 - 2 * transition);
  return 1 - smoothTransition;
}

/** Placement loops normalize once, and never query terrain to clear a trail. */
export function createNaturalTrailSampler(config={}) {
  const settings=normalizeNaturalTrailConfig(config);
  return {settings,fieldAt:(x,z)=>fieldAt(x,z,settings),maskAt:(x,z)=>maskAt(x,z,settings)};
}
