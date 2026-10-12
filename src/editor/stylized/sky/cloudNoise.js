import { dot, floor, fract, mix, vec2, vec3 } from 'three/tsl';

/**
 * Value noise for the clouds, with a hash that does not repeat.
 *
 * The shared stylized noise hashes lattice points as fract(p · (127.1, 311.7)):
 * on whole-number lattice points only the .1 and .7 survive, so the pattern
 * repeats every ten cells along both axes and the cloud field reads as
 * diagonal, smeared streaks. This hash (after Dave Hoskins' hash12) scrambles
 * lattice points properly over the wrapped cloud domain (see CloudShadow).
 * The dome and the ground's cloud shadows must both use it, or the shadows
 * stop matching the clouds.
 */
function hash(position) {
  const p3 = fract(vec3(position.x, position.y, position.x).mul(0.1031)).toVar();
  const mixed = p3.add(dot(p3, p3.yzx.add(33.33)));
  return fract(mixed.x.add(mixed.y).mul(mixed.z));
}

function noise(position) {
  const integer = floor(position);
  const fraction = fract(position);
  const curve = fraction.mul(fraction).mul(vec2(3).sub(fraction.mul(2)));
  const north = mix(hash(integer), hash(integer.add(vec2(1, 0))), curve.x);
  const south = mix(hash(integer.add(vec2(0, 1))), hash(integer.add(vec2(1, 1))), curve.x);
  return mix(north, south, curve.y);
}

function lowOctaves(position) {
  return noise(position).mul(0.5)
    .add(noise(position.mul(2.03).add(vec2(3.1, 7.7))).mul(0.25));
}

/**
 * The cloud fbm's halves: `low` (octaves 0–1, the masses, sums to 0.75) and
 * `detail` (octaves 2–3, the ragged edges, sums to 0.1875).
 */
export function cloudFbmBands(position) {
  const low = lowOctaves(position);
  const detail = noise(position.mul(4.1209).add(vec2(9.393, 23.331))).mul(0.125)
    .add(noise(position.mul(8.365427).add(vec2(22.168, 55.062))).mul(0.0625));
  return { low, detail };
}

/** The masses alone, normalised to 0..1: cheap enough for every lit surface's cloud shadow. */
export function cloudFbm2(position) {
  return lowOctaves(position).div(0.75);
}
