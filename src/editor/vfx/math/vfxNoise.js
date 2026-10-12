/**
 * Seeded 2D/3D value noise, fBm and a cheap divergence-free-ish turbulence
 * field. Used once at startup by the atlas painters and every frame by the
 * simulator's turbulence force, so it avoids allocation.
 */

const PERMUTATION_SIZE = 256;

function buildPermutation(seed) {
  const table = new Uint8Array(PERMUTATION_SIZE * 2);
  const source = new Uint8Array(PERMUTATION_SIZE);
  for (let index = 0; index < PERMUTATION_SIZE; index += 1) source[index] = index;
  let state = (seed * 2654435761) >>> 0;
  for (let index = PERMUTATION_SIZE - 1; index > 0; index -= 1) {
    state = (Math.imul(state ^ (state >>> 13), 1274126177) + 0x9e3779b9) >>> 0;
    const swap = state % (index + 1);
    const held = source[index];
    source[index] = source[swap];
    source[swap] = held;
  }
  for (let index = 0; index < PERMUTATION_SIZE * 2; index += 1) {
    table[index] = source[index & (PERMUTATION_SIZE - 1)];
  }
  return table;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function createNoise(seed = 7) {
  const perm = buildPermutation(seed);
  const hash2 = (x, y) => perm[perm[x & 255] + (y & 255)] / 255;
  const hash3 = (x, y, z) => perm[perm[perm[x & 255] + (y & 255)] + (z & 255)] / 255;

  /** Value noise in [0, 1]. Pass `period` to tile it on an integer lattice. */
  const noise2 = (x, y, period = 0) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const wrap = (value) => (period > 0 ? ((value % period) + period) % period : value);
    const xa = wrap(x0);
    const xb = wrap(x0 + 1);
    const ya = wrap(y0);
    const yb = wrap(y0 + 1);
    const a = hash2(xa, ya);
    const b = hash2(xb, ya);
    const c = hash2(xa, yb);
    const d = hash2(xb, yb);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  const noise3 = (x, y, z) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const tz = fade(z - z0);
    const c000 = hash3(x0, y0, z0);
    const c100 = hash3(x0 + 1, y0, z0);
    const c010 = hash3(x0, y0 + 1, z0);
    const c110 = hash3(x0 + 1, y0 + 1, z0);
    const c001 = hash3(x0, y0, z0 + 1);
    const c101 = hash3(x0 + 1, y0, z0 + 1);
    const c011 = hash3(x0, y0 + 1, z0 + 1);
    const c111 = hash3(x0 + 1, y0 + 1, z0 + 1);
    const x00 = c000 + (c100 - c000) * tx;
    const x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx;
    const x11 = c011 + (c111 - c011) * tx;
    const y0v = x00 + (x10 - x00) * ty;
    const y1v = x01 + (x11 - x01) * ty;
    return y0v + (y1v - y0v) * tz;
  };

  /** Fractal sum normalised to [0, 1]. */
  const fbm2 = (x, y, octaves = 5, lacunarity = 2, gain = 0.5, period = 0) => {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += noise2(x * frequency, y * frequency, period > 0 ? period * frequency : 0) * amplitude;
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / norm;
  };

  /** Ridged fBm: sharp creases, used for cracks and lightning glow. */
  const ridged2 = (x, y, octaves = 5) => {
    let sum = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let norm = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      const n = 1 - Math.abs(noise2(x * frequency, y * frequency) * 2 - 1);
      sum += n * n * amplitude;
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return sum / norm;
  };

  /**
   * Smooth swirling force, cheaper than true curl noise and good enough for
   * smoke: three phase-shifted noise samples centred on zero.
   */
  const turbulence3 = (x, y, z, target) => {
    target.x = noise3(x, y + 31.7, z + 11.3) * 2 - 1;
    target.y = noise3(x + 17.1, y, z + 47.9) * 2 - 1;
    target.z = noise3(x + 53.3, y + 7.7, z) * 2 - 1;
    return target;
  };

  return { noise2, noise3, fbm2, ridged2, turbulence3 };
}
