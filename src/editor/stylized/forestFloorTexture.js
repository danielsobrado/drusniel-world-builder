/**
 * The per-chunk forest-floor texture: R the forest canopy's shading of the
 * ground, G the contact shade under trunks and stones (contactShade.js), B the
 * bare litter between the canopy's grass islands (writeForestFloorLitter).
 *
 * 64 texels over a 128 m chunk, two metres each, so the donor's contact shade
 * can sit at trunk scale — a 4 m patch round a trunk, 2–3 m round a stone. At
 * the former 16 texels (8 m) a trunk-sized patch was a fraction of a texel and
 * the shade had to be canopy-sized instead.
 *
 * The canopy does not need that detail and each of its samples is a forest
 * habitat evaluation, so it keeps its 16 × 16 samples and is upsampled
 * bilinearly into the texture: the same main-thread cost as before.
 */
export const FOREST_FLOOR_SIZE = 128;
export const FOREST_FLOOR_CANOPY_SAMPLES = 16;

/**
 * A texel centre's position in canopy sample space. The samples are edge-aligned,
 * so the border texels of two neighbouring chunks read the same shared sample:
 * centre-aligned samples clamped at the rim stepped at every chunk edge.
 */
export function canopySampleCoord(texel, size, samples) {
  return (texel + 0.5) / size * (samples - 1);
}

/**
 * Writes the canopy into R and clears G and B, over the whole texture.
 *
 * @param {object} options
 * @param {Uint8Array} options.pixels RGBA bytes, `size * size`
 * @param {number} options.size texels per side
 * @param {number} options.samples canopy samples per side
 * @param {(sampleX: number, sampleZ: number) => number} options.canopyAt
 *   canopy 0..1 at sample (x, z) of an edge-aligned grid: sample 0 and
 *   `samples - 1` sit on the chunk's edges, so neighbouring chunks share them
 * @param {Float32Array} [options.scratch] reusable `samples * samples` buffer
 */
export function writeForestFloorCanopy({
  pixels,
  size,
  samples,
  canopyAt,
  scratch = new Float32Array(samples * samples),
}) {
  if (!(pixels instanceof Uint8Array) || pixels.length !== size * size * 4) {
    throw new Error('Forest floor needs a size × size RGBA byte texture.');
  }
  if (!Number.isInteger(samples) || samples < 1 || samples > size) {
    throw new Error('Forest floor canopy samples must be an integer within [1, size].');
  }
  for (let z = 0; z < samples; z += 1) {
    for (let x = 0; x < samples; x += 1) {
      scratch[z * samples + x] = Math.min(1, Math.max(0, canopyAt(x, z)));
    }
  }
  for (let z = 0; z < size; z += 1) {
    const sz = canopySampleCoord(z, size, samples);
    const z0 = Math.floor(sz);
    const z1 = Math.min(samples - 1, z0 + 1);
    const tz = sz - z0;
    for (let x = 0; x < size; x += 1) {
      const sx = canopySampleCoord(x, size, samples);
      const x0 = Math.floor(sx);
      const x1 = Math.min(samples - 1, x0 + 1);
      const tx = sx - x0;
      const top = scratch[z0 * samples + x0] * (1 - tx) + scratch[z0 * samples + x1] * tx;
      const bottom = scratch[z1 * samples + x0] * (1 - tx) + scratch[z1 * samples + x1] * tx;
      const index = (z * size + x) * 4;
      pixels[index] = Math.round((top * (1 - tz) + bottom * tz) * 255);
      pixels[index + 1] = 0;
      pixels[index + 2] = 0;
      pixels[index + 3] = 255;
    }
  }
  return scratch;
}

/**
 * Writes the bare woodland floor into B: the share of each texel the canopy
 * leaves without grass. Under a wood the meadow grows in islands
 * (GrassPatchiness.js); without this the ground between them stayed meadow
 * green and read as a lawn with a few blades on it.
 *
 * @param {object} options
 * @param {Uint8Array} options.pixels RGBA bytes, `size * size`
 * @param {number} options.size texels per side
 * @param {(texelX: number, texelZ: number) => number} options.bareAt 0..1
 */
export function writeForestFloorLitter({ pixels, size, bareAt }) {
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      pixels[(z * size + x) * 4 + 2] = Math.round(Math.min(1, Math.max(0, bareAt(x, z))) * 255);
    }
  }
}
