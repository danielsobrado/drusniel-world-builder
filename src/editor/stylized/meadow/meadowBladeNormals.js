import { mix, normalize, oneMinus, smoothstep, vec3 } from 'three/tsl';

/** Analytic near-field shading controls. No new textures or grass geometry. */
export const MEADOW_NORMAL_DEFAULTS = Object.freeze({
  strength: 0.75,
  slopeScale: 1.2,
  maxSlope: 1.25,
  fadeStart: 14,
  fadeEnd: 38,
});

const LIMITS = Object.freeze({
  strength: [0, 1],
  slopeScale: [0, 2],
  maxSlope: [0.2, 2],
  fadeStart: [0, 400],
  fadeEnd: [0, 400],
});

export function resolveMeadowNormals(source, path = 'stylizedSurface.grass.meadow.normals') {
  if (source === undefined) return MEADOW_NORMAL_DEFAULTS;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`Invalid editor configuration: ${path} must be an object.`);
  }
  const result = { ...MEADOW_NORMAL_DEFAULTS };
  for (const [key, value] of Object.entries(source)) {
    const bounds = LIMITS[key];
    if (!bounds) throw new Error(`Invalid editor configuration: ${path}.${key} is unknown.`);
    if (!Number.isFinite(value) || value < bounds[0] || value > bounds[1]) {
      throw new Error(`Invalid editor configuration: ${path}.${key} must be in [${bounds.join(', ')}].`);
    }
    result[key] = value;
  }
  if (result.fadeEnd <= result.fadeStart) {
    throw new Error(`Invalid editor configuration: ${path}.fadeEnd must exceed fadeStart.`);
  }
  return Object.freeze(result);
}

/** Rounded ribbon normal in the blade's rotated XZ frame. */
export function meadowBladeWorldNormal(rotation, side, ratio) {
  const widthAxis = vec3(rotation.y, 0, rotation.x);
  const forwardAxis = vec3(rotation.x.negate(), 0, rotation.y);
  const tip = smoothstep(0.15, 1, ratio);
  const rooted = smoothstep(0, 0.12, ratio);
  return normalize(vec3(0, 1, 0)
    .add(widthAxis.mul(side).mul(mix(0.6, 0.25, tip)).mul(rooted))
    .add(forwardAxis.mul(tip).mul(0.45)));
}

/**
 * A chord-based tangent estimate of the actual deformed centreline, computed
 * where the vertex is displaced. The normal tracks wind, resting curvature,
 * tip flutter, and player/spell folds without sampling their fields again.
 */
export function meadowBentNormalNode({ baseline, centerline, ratio, height, distance, settings }) {
  const upright = centerline.y.max(height.mul(0.08)).max(1e-4);
  const slope = centerline.xz.div(upright).mul(settings.slopeScale);
  const bounded = slope.mul(settings.maxSlope.div(slope.length().max(settings.maxSlope)));
  const near = oneMinus(smoothstep(settings.fadeStart, settings.fadeEnd, distance));
  const rooted = smoothstep(0.02, 0.35, ratio);
  const influence = settings.strength.mul(near).mul(rooted);
  return normalize(baseline.sub(vec3(bounded.x, 0, bounded.y).mul(influence)));
}

function smooth(a, b, value) {
  const r = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return r * r * (3 - 2 * r);
}

/** Numeric twin of the centreline normal projection, for regression checks. */
export function meadowBentNormalNumber(baseline, centerline, ratio, height, distance, settings = MEADOW_NORMAL_DEFAULTS) {
  const denominator = Math.max(centerline[1], height * 0.08, 1e-4);
  const vx = centerline[0] / denominator * settings.slopeScale;
  const vz = centerline[2] / denominator * settings.slopeScale;
  const magnitude = Math.hypot(vx, vz);
  const limit = settings.maxSlope / Math.max(magnitude, settings.maxSlope);
  const influence = settings.strength
    * (1 - smooth(settings.fadeStart, settings.fadeEnd, distance))
    * smooth(0.02, 0.35, ratio);
  const result = [
    baseline[0] - vx * limit * influence,
    baseline[1],
    baseline[2] - vz * limit * influence,
  ];
  const length = Math.hypot(...result);
  return result.map(value => value / length);
}
