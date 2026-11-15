/**
 * Snow the wind has shaped on the glacier forefield. The wind runs down the
 * valley off the ice: it banks snow in the lee of whatever stands in it and
 * scours the ground bare just upwind, where it has to climb over.
 */

const P = (x, y, z) => ({ x, y, z });
const clamp01 = (value) => Math.min(1, Math.max(0, value));
/** How far upwind of an obstacle its moat is centred, and how wide it is, in obstacle sizes. */
const SCOUR_LEAD = 1.5, SCOUR_SPREAD = 1.1;
/** A drift tail's height and half width at the obstacle, per metre of obstacle, and how much it narrows downwind. */
const TAIL_RISE = 0.5, TAIL_WIDTH = 1, TAIL_NARROW = 0.6;
/** Field value of a point nowhere near a shape. */
const CLEAR = 4;
/** Metres over which the lee bank tapers in at its ends and beside the gap at the arch. */
const BANK_EASE = 4;

const smoothBump = (t) => Math.max(0, 1 - t * t) ** 2;
const moatCentre = (at, size, wind) => ({ x: at.x - wind.x * size * SCOUR_LEAD, z: at.z - wind.z * size * SCOUR_LEAD });

/**
 * Snow round an obstacle `size` metres across at `at` (plan): a tail tapering
 * downwind from its lee, `tail` sizes long, and a moat `scour` metres deep
 * before its windward face. `wind` is a unit plan vector `{ x, z }`.
 */
export function driftAround(b, ground, at, size, { wind, tail, scour }) {
  const length = size * tail, width = size * TAIL_WIDTH, rise = size * TAIL_RISE;
  const base = ground(at.x, at.z), reach = length + width + 2;
  b.grid.fill({
    box: { min: P(at.x - reach, base - 4, at.z - reach), max: P(at.x + reach, base + rise + 4, at.z + reach) },
    solid(x, y, z) {
      const dx = x - at.x, dz = z - at.z;
      const t = (dx * wind.x + dz * wind.z) / length;
      if (t < 0 || t > 1) return CLEAR;
      const across = (dz * wind.x - dx * wind.z) / (width * (1 - TAIL_NARROW * t));
      return y - ground(x, z) - rise * (1 - t) ** 1.4 * smoothBump(across);
    },
  });
  // Only ground is cut: nothing above it opens, so the obstacle itself stands.
  const centre = moatCentre(at, size, wind), radius = size * SCOUR_SPREAD;
  b.grid.carve({
    box: { min: P(centre.x - radius - 1, base - 4, centre.z - radius - 1), max: P(centre.x + radius + 1, base + 4, centre.z + radius + 1) },
    air: (x, y, z) => Math.min(y - ground(x, z) + scour * smoothBump(Math.hypot(x - centre.x, z - centre.z) / radius), ground(x, z) - y),
  });
}

/** 0..1: how deep into the wind-scoured moat of any of `obstacles` (`{ x, z, size }`) a plan point lies. */
export function scourAt(obstacles, wind) {
  const moats = obstacles.map(({ x, z, size }) => ({ ...moatCentre({ x, z }, size, wind), radius: size * SCOUR_SPREAD }));
  return (x, z) => {
    let deepest = 0;
    for (const moat of moats) deepest = Math.max(deepest, smoothBump(Math.hypot(x - moat.x, z - moat.z) / moat.radius));
    return deepest;
  };
}

/**
 * The drift banked against the old wall's lee (south) face, `bank` metres deep
 * at the foot and running out over `bankReach`; open within `bankGap` of the
 * arch, where the wind funnelled through scours the way clear.
 */
export function leeBank(b, ground, wall, { ridge, arch, snow }) {
  b.grid.fill({
    box: { min: P(ridge.west, -4, arch.z - 6), max: P(ridge.east, snow.bank + 6, arch.z + arch.depth / 2 + snow.bankReach + 4) },
    solid(x, y, z) {
      if (z < wall.z(x)) return CLEAR;
      const t = Math.max(0, (z - wall.south(x)) / snow.bankReach);
      if (t >= 1) return CLEAR;
      const open = clamp01((Math.abs(x - arch.x) - snow.bankGap) / BANK_EASE)
        * clamp01((x - ridge.west) / BANK_EASE) * clamp01((ridge.east - x) / BANK_EASE);
      return y - ground(x, z) - snow.bank * open * (1 - t) ** 2;
    },
  });
}
