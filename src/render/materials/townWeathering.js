import { float, mix, mx_noise_float, smoothstep, vec3 } from 'three/tsl';

/**
 * The weather a town's buildings have stood in, shared by both town renderers
 * (SettlementView's workshop houses and the medieval kit), so a street reads
 * as one place whichever draws it.
 *
 * The target is lived-in northern stonework: green growth where rain and
 * debris settle on sky-facing ledges and slates, dark streaks where water runs
 * down a face from what is above it, and a damp band where a wall meets the
 * ground. Fragment work only and two gradient noises — the vertex stage
 * re-runs for every shadow cascade, so none of it belongs there.
 */

export const WEATHER_MOSS = Object.freeze([0.2, 0.25, 0.1]);
export const WEATHER_DAMP = Object.freeze([0.2, 0.19, 0.14]);

/** Per material family: how much of each the surface takes. */
export const WEATHER_FAMILIES = Object.freeze({
  stone: Object.freeze({ moss: 0.55, streaks: 1, damp: 1 }),
  plaster: Object.freeze({ moss: 0.15, streaks: 0.8, damp: 0.9 }),
  mortar: Object.freeze({ moss: 0.3, streaks: 0.6, damp: 1 }),
  timber: Object.freeze({ moss: 0.2, streaks: 0.5, damp: 0.7 }),
  roof: Object.freeze({ moss: 0.45, streaks: 0, damp: 0 }),
});

/**
 * @param {import('three/tsl').Node} colour linear albedo (vec3)
 * @param {object} options
 * @param {import('three/tsl').Node} options.place position in metres, stable per building
 *   (not render space, which re-centres with the floating origin)
 * @param {import('three/tsl').Node} options.up world normal's y
 * @param {?import('three/tsl').Node} [options.height] metres above the building's ground,
 *   or null where it is not known (no damp band then)
 * @param {{ moss: number|Node, streaks: number|Node, damp: number|Node }} options.family amounts, 0..1
 * @returns {import('three/tsl').Node} weathered albedo (vec3)
 */
export function weatherTownSurface(colour, { place, up, height = null, family }) {
  const patch = mx_noise_float(place.mul(0.6));
  const facing = smoothstep(0.35, 0.85, up);
  const moss = facing.mul(smoothstep(-0.15, 0.35, patch)).mul(family.moss);
  // Runs: noise stretched along the fall line, on faces that are near vertical.
  const run = mx_noise_float(vec3(place.x.mul(2.4), place.y.mul(0.16), place.z.mul(2.4)));
  const vertical = float(1).sub(up.abs()).clamp(0, 1);
  const streak = smoothstep(0.05, 0.55, run).mul(vertical).mul(family.streaks).mul(0.24);
  let weathered = colour.mul(float(1).sub(streak));
  if (height) {
    const foot = float(1).sub(smoothstep(0, 1.15, height)).pow(1.6);
    const damp = foot.mul(patch.mul(0.25).add(0.75)).mul(family.damp).mul(0.6);
    weathered = mix(weathered, vec3(...WEATHER_DAMP).mul(colour.dot(vec3(0.3, 0.55, 0.15)).mul(1.4).add(0.35)), damp);
  }
  return mix(weathered, vec3(...WEATHER_MOSS).mul(colour.dot(vec3(0.3, 0.55, 0.15)).mul(0.9).add(0.55)), moss.clamp(0, 0.85));
}

/** Trodden grime on paving: how dark a patch gets, and the earth it darkens toward. */
export const TREAD_GRIME = Object.freeze({ depth: 0.42, earth: [0.62, 0.55, 0.45], tone: 0.86 });

/**
 * A lived-in street's paving: never as pale as its photograph, and darkened
 * in broad patches where feet, carts and rain leave dirt. It also hides the
 * tile repeat. `coords` is a 2D position in metres (or texture tiles) that is
 * stable on the ground.
 */
export function treadPaving(colour, coords) {
  const grime = smoothstep(0.05, 0.65, mx_noise_float(vec3(coords.mul(0.27), 9.2))).mul(TREAD_GRIME.depth);
  const worn = colour.mul(TREAD_GRIME.tone);
  return mix(worn, worn.mul(vec3(...TREAD_GRIME.earth)), grime);
}
