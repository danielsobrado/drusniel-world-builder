export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function advanceUnderwaterBlend(current, submerged, deltaSeconds, transitionSeconds) {
  const target = submerged ? 1 : 0;
  if (!Number.isFinite(current)) return target;
  const duration = Math.max(1e-4, transitionSeconds);
  const step = Math.max(0, deltaSeconds) / duration;
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return current;
}

export function mixNumber(left, right, amount) {
  const t = clamp01(amount);
  return left * (1 - t) + right * t;
}

/** Keep submerged pixels coloured while the eye straddles the surface. */
export function resolveWaterlineBlend({ enabled, surfaceHeight, eyeY, range }) {
  if (!enabled || !Number.isFinite(surfaceHeight)
      || !Number.isFinite(eyeY) || !Number.isFinite(range) || range <= 0) return 0;
  return 1 - clamp01(Math.max(0, eyeY - surfaceHeight) / range);
}

const WATERLINE_NEAR_APPROACH_START_M = 1.4;
const WATERLINE_NEAR_APPROACH_END_M = 0.55;
const WATERLINE_NEAR_SURFACE_RANGE_M = 0.28;
const WATERLINE_NEAR_SURFACE_MIN_M = 0.06;

/**
 * Tighten camera.near as the eye approaches the water surface so swimming or
 * wading near the waterline never clips the water mesh across the lower frame.
 */
export function resolveWaterlineNearPlane({
  surfaceNearPlane,
  underwaterNearPlane,
  blend = 0,
  waterlineEnabled = false,
  surfaceHeight = null,
  eyeY = null,
}) {
  const diveNear = mixNumber(surfaceNearPlane, underwaterNearPlane, blend);
  if (!waterlineEnabled || !Number.isFinite(surfaceHeight) || !Number.isFinite(eyeY)) {
    return diveNear;
  }
  const clearance = eyeY - surfaceHeight;
  const approach = 1 - clamp01(
    (clearance - WATERLINE_NEAR_APPROACH_END_M)
    / (WATERLINE_NEAR_APPROACH_START_M - WATERLINE_NEAR_APPROACH_END_M),
  );
  const near = mixNumber(surfaceNearPlane, underwaterNearPlane, Math.max(blend, approach));
  if (clearance > -0.05 && clearance < WATERLINE_NEAR_SURFACE_RANGE_M) {
    const surfaceMin = Math.min(near, WATERLINE_NEAR_SURFACE_MIN_M);
    const closeness = 1 - clamp01(Math.max(0, clearance) / WATERLINE_NEAR_SURFACE_RANGE_M);
    return mixNumber(near, surfaceMin, closeness * (1 - clamp01(blend)));
  }
  return near;
}
