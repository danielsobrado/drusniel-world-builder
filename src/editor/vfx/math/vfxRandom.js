/**
 * Small deterministic helpers shared by the atlas baker and the particle
 * simulator. Everything here is allocation-free on the hot path.
 */

/** Mulberry32: a fast seeded generator returning [0, 1). */
export function createRandom(seed = 1) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (minimum, maximum) => minimum + (maximum - minimum) * next();
  next.signed = () => next() * 2 - 1;
  next.pick = (items) => items[Math.floor(next() * items.length) % items.length];
  /** Uniform direction on the unit sphere, written into `target`. */
  next.direction = (target) => {
    const z = next() * 2 - 1;
    const angle = next() * Math.PI * 2;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    target.x = Math.cos(angle) * radius;
    target.y = z;
    target.z = Math.sin(angle) * radius;
    return target;
  };
  return next;
}

/** A value read from a `[min, max]` pair or a plain number. */
export function sampleRange(value, random) {
  if (Array.isArray(value)) return value[0] + (value[1] - value[0]) * random();
  return value ?? 0;
}

export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Named easing curves for size, opacity and light envelopes. `t` is clamped.
 * The explosion's signature motion is `outExpo`: almost all growth happens in
 * the first tenth of the life, then the puff hangs.
 */
export const EASINGS = Object.freeze({
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  outQuart: (t) => 1 - (1 - t) ** 4,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
});

export function ease(name, t) {
  return (EASINGS[name] ?? EASINGS.linear)(clamp01(t));
}
