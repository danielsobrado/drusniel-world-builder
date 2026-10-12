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
  }));
}
