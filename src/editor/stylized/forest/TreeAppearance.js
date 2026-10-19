import { hash32 } from '../scatterMath.js';

export const TREE_COLOR_VARIATION_MIN = 0.9;
export const TREE_COLOR_VARIATION_RANGE = 0.2;

export function treeBaseSeed(placement) {
  if (Number.isFinite(placement.priority)) return placement.priority;
  return hash32(placement.index ?? 0) / 0xffffffff;
}

export function treeRenderSeed(placement) {
  return Number.isFinite(placement.windSeed)
    ? placement.windSeed
    : treeBaseSeed(placement);
}

export function treeColorVariation(placement) {
  return TREE_COLOR_VARIATION_MIN
    + treeRenderSeed(placement) * TREE_COLOR_VARIATION_RANGE;
}

/**
 * `??` would only guard null and undefined, and a NaN here does not fail loudly — it
 * reaches the vertex shader as a scale and silently collapses the crown. Every channel is
 * therefore checked for finiteness, and foliage density is floored at zero so the square
 * root can never produce NaN.
 */
function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function treeMorphology(placement) {
  const crownScale = finite(placement.crownScale, 1);
  const crownAspect = finite(placement.crownAspectScale, finite(placement.crownAspect, 1));
  const foliageDensity = Math.max(0, finite(placement.foliageDensity, 1));
  if (placement.ageClass === 'dead') return [1, 0, finite(placement.trunkScale, 1)];
  // Horizontal crown carries aspect and foliage density so sparse/wetland stands
  // thin in silhouette without a second material path.
  return [
    crownScale * crownAspect * Math.sqrt(foliageDensity),
    Math.max(1, crownScale * foliageDensity),
    finite(placement.trunkScale, 1),
  ];
}

/**
 * The low-poly proxy has one cylinder spanning the authored trunk bounds and
 * three solid crown lobes. Applying the near mesh's vertical crown shrink to
 * that abstraction exposes the full-height cylinder above a tiny canopy, which
 * reads as a detached pole. The placement matrix already carries age/height,
 * so keep the proxy's vertical envelope connected and retain only bounded
 * horizontal silhouette variation.
 */
export function treeProxyMorphology(placement) {
  const [horizontal, vertical, trunk] = treeMorphology(placement);
  if (placement.ageClass === 'dead') return [horizontal, 0, trunk];
  return [
    Math.max(0.55, horizontal),
    Math.max(1, vertical),
    trunk,
  ];
}

/** Lean angles (radians) from clod-style leanX/leanZ components. */
export function treeLeanAngles(placement) {
  const leanX = Number(placement.leanX) || 0;
  const leanZ = Number(placement.leanZ) || 0;
  const droop = Number(placement.branchDroop) || 0;
  return {
    rotationX: Math.atan(leanZ) + droop * 0.12,
    rotationZ: -Math.atan(leanX),
  };
}

/**
 * An impostor's appearance vec4 is full (crown width, leaf tint rgb), so its
 * canopy snow rides in the width's integer part: `width + SPAN × round(snow ×
 * 255)`. Widths stay below SPAN, and at the largest code float32 still keeps
 * the width to ~2e-4.
 */
export const IMPOSTOR_WIDTH_SPAN = 8;
const SNOW_STEPS = 255;

export function packImpostorWidth(width, snow = 0) {
  const clampedWidth = Math.min(IMPOSTOR_WIDTH_SPAN - 1e-3, Math.max(0, finite(width, 1)));
  const code = Math.round(Math.min(1, Math.max(0, finite(snow, 0))) * SNOW_STEPS);
  return clampedWidth + IMPOSTOR_WIDTH_SPAN * code;
}

export function unpackImpostorWidth(packed) {
  const code = Math.floor(packed / IMPOSTOR_WIDTH_SPAN);
  return { width: packed - code * IMPOSTOR_WIDTH_SPAN, snow: code / SNOW_STEPS };
}

/** The same decode in TSL, for the impostor material. */
export function unpackImpostorWidthNode(packed) {
  const code = packed.div(IMPOSTOR_WIDTH_SPAN).floor();
  return { width: packed.sub(code.mul(IMPOSTOR_WIDTH_SPAN)), snow: code.div(SNOW_STEPS) };
}
