import { ease } from '../math/vfxRandom.js';

/**
 * Grass reactions. The meadow springs back within about a second, so a blast
 * wave is a disc that grows outward once, and a mark that must stay visible —
 * a scorch, a puddle, a rune — is a disc held down for as long as it lasts,
 * easing off at the end.
 */

/** Grass blown flat by a shockwave racing out to `radius` over `seconds`. */
export function blastWave(fx, center, radius, seconds = 0.35, start = 0) {
  fx.press(start, start + seconds, (t) => ({
    x: center.x, z: center.z, radius: radius * ease('outCubic', t) + 0.5, strength: 1, inner: 0.85,
  }));
}

/** Seconds between refreshes of a held mark; the meadow fades marks far slower. */
const MARK_REFRESH_S = 0.25;
/** Seconds between refreshes of held-down grass: still fully folded between them. */
const HOLD_REFRESH_S = 0.1;

/**
 * The grass itself marked — scorched, frosted, withered — over a disc: it
 * spreads in over `grow` seconds from `start`, is kept fresh until `end`, and
 * then fades at the meadow's own pace for its kind (seconds for moonlight,
 * tens of seconds for burnt grass).
 */
export function markGrass(fx, center, radius, mark, start, end, { strength = 1, grow = 0.3, inner = 0.45 } = {}) {
  const spread = Math.max(0, Math.min(grow, end - start));
  const disc = (scale) => ({ x: center.x, z: center.z, radius: radius * scale, strength, inner });
  if (spread > 0) fx.mark(start, start + spread, mark, (t) => disc(0.35 + 0.65 * ease('outCubic', t)));
  if (end > start + spread) fx.mark(start + spread, end, mark, () => disc(1), MARK_REFRESH_S);
}

/** Grass held down over a mark from `start` to `end`, released over the last `release` seconds. */
export function holdFlat(fx, center, radius, start, end, strength = 0.9, release = 2) {
  const span = Math.max(1e-3, end - start);
  const releaseFraction = Math.min(1, release / span);
  fx.press(start, end, (t) => ({
    x: center.x,
    z: center.z,
    radius,
    strength: strength * Math.min(1, (1 - t) / releaseFraction),
    inner: 0.55,
  }), HOLD_REFRESH_S);
}
