import { clamp, float, mix, oneMinus, smoothstep, vec2 } from 'three/tsl';

/** Puddle clock below which no water stands (the global path's PUDDLE_WETNESS). */
export const PUDDLE_CLOCK_START = 0.45;
/** Puddle clock at which every basin that can hold water is full. */
const PUDDLE_CLOCK_FULL = 0.9;

/**
 * One texel of the wetness field from its terrain, noise and the clocks
 * (`groundWetnessClocksUniform`: x dries first, y holds water, z standing water).
 * Plain TSL arithmetic, so a Node test can evaluate it.
 *
 * @param {object} input TSL nodes
 * @param {Node} input.slope tan of the ground's slope
 * @param {Node} input.hollow metres the ground lies below its ~6 m surroundings
 * @param {Node} input.sun 0..1 how squarely the sun strikes the ground
 * @param {Node} input.patches 0..1 broad noise (~85 m): where the soil holds water
 * @param {Node} input.mottle 0..1 fine noise (~32 m repeat): uneven darkening
 * @param {Node} input.clocks vec3 ground clocks
 * @returns {Node} vec2: film wetness, puddle spread (both 0..1)
 */
export function wetnessTexel({ slope, hollow, sun, patches, mottle, clocks }) {
  const runoff = smoothstep(0.35, 1, slope);
  const basin = smoothstep(0.05, 0.5, hollow);
  const flat = oneMinus(smoothstep(0.06, 0.2, slope));
  // 0 dries first (sunny, steep, raised), 1 stays wet longest (shaded hollows).
  const retention = clamp(
    float(0.55).add(basin.mul(0.45)).sub(sun.mul(0.35)).sub(runoff.mul(0.5)).add(patches.sub(0.5).mul(0.5)),
    0, 1,
  );
  // Steep ground sheds the rain and never soaks through.
  const film = mix(clocks.x, clocks.y, retention).mul(oneMinus(runoff.mul(0.6))).mul(mix(float(0.8), float(1), mottle));
  // Puddles stand on flats, deepest in hollows and where the soil holds water;
  // sun shrinks them first. Their clock fills last and dries last.
  const holds = clamp(
    float(0.25).add(basin.mul(0.6)).add(patches.sub(0.5).mul(0.5)).add(mottle.sub(0.5).mul(0.4)).sub(sun.mul(0.25)),
    0, 1,
  ).mul(flat);
  const puddle = smoothstep(PUDDLE_CLOCK_START, PUDDLE_CLOCK_FULL, clocks.z).mul(holds);
  return vec2(film, puddle);
}
