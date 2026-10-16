import { valueNoise } from './valueNoise2d.js';

/**
 * Fractal domain warp for biome lookups, in cell units.
 *
 * An imported Azgaar atlas texel spans kilometres (Eldara: ~4 000 cells), so a
 * nearest-texel biome lookup draws every border as a straight staircase along
 * the atlas grid, and walking across one switches grass, ground and undergrowth
 * at a ruled line. Reading the biome through this warp instead bends each
 * border into a coastline-like curve at every scale from the atlas texel down
 * to a few cells, so a forest edge lobes into the meadow and the meadow
 * fingers back. It moves where a biome is read, never which biomes exist, so
 * the Azgaar IDs stay canonical.
 *
 * Deterministic and allocation-free: evaluated per cell in the chunk workers
 * and on the main thread alike, it must agree bit for bit with itself.
 */
export const BIOME_BOUNDARY_WARP_DEFAULTS = Object.freeze({
  /** Coarsest wavelength, in atlas texels. */
  baseWavelengthTexels: 1.5,
  /**
   * Each octave's offset as a share of its own wavelength. The octaves sum to
   * under 2 × 1.5 × 0.26 = 0.78 texel, which is what lets a generator skip the
   * warp wherever a texel's 3×3 neighbourhood shares one biome.
   */
  amplitudeRatio: 0.26,
  /** Finest wavelength, in cells: below this the 2 m grid itself is the edge. */
  minWavelengthCells: 3,
  maxOctaves: 16,
});

const SEED_SALT_X = 0x6a09e667;
const SEED_SALT_Z = 0x3c6ef372;

/**
 * @param {object} options
 * @param {number} options.seed world seed
 * @param {number} options.cellsPerTexel how many cells one atlas texel covers
 * @returns {null | ((cellX: number, cellZ: number, out: {x: number, z: number}) => object)}
 *   null when the atlas is already finer than the warp's smallest octave
 */
export function createBiomeBoundaryWarp({ seed, cellsPerTexel, settings = BIOME_BOUNDARY_WARP_DEFAULTS }) {
  if (!Number.isFinite(cellsPerTexel) || cellsPerTexel <= 0) return null;
  const { baseWavelengthTexels, amplitudeRatio, minWavelengthCells, maxOctaves } = settings;
  const frequencies = [];
  const amplitudes = [];
  for (let wavelength = baseWavelengthTexels * cellsPerTexel;
    wavelength >= minWavelengthCells && frequencies.length < maxOctaves;
    wavelength *= 0.5) {
    frequencies.push(1 / wavelength);
    amplitudes.push(wavelength * amplitudeRatio);
  }
  if (frequencies.length === 0) return null;
  const seedX = (seed ^ SEED_SALT_X) | 0;
  const seedZ = (seed ^ SEED_SALT_Z) | 0;
  return (cellX, cellZ, out) => {
    let x = 0;
    let z = 0;
    for (let octave = 0; octave < frequencies.length; octave += 1) {
      const frequency = frequencies[octave];
      const amplitude = amplitudes[octave];
      // Octaves are offset from one another so their lattices never align.
      const shift = octave * 17.31;
      x += valueNoise(cellX * frequency + shift, cellZ * frequency - shift, seedX + octave * 1013) * amplitude;
      z += valueNoise(cellX * frequency - shift, cellZ * frequency + shift, seedZ + octave * 1013) * amplitude;
    }
    out.x = x;
    out.z = z;
    return out;
  };
}
