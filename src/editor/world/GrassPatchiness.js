import { hash2d, valueNoise } from './valueNoise2d.js';

/**
 * Where thin grass grows: islands and tussocks over bare ground, not an even fuzz.
 *
 * A biome whose meadow density is low (tundra, taiga, savanna) used to thin its
 * stems by an independent roll each, which spreads the same few blades evenly
 * over green ground and reads as a sparse lawn. Real thin grassland is patchy:
 * earth with islands of grass, and inside each island the stems cluster into
 * tussocks. Two scales do that here, both deterministic in canonical cells:
 *
 * - `grassPatchCover` holds the islands. It is a continuous canonical field:
 *   the surface mask bakes it into coverage, so the terrain shows soil between
 *   islands, and the meadow sampler reads it again per stem at the live
 *   density, so a Settings change thins the stand before pages rebuild. The
 *   two reads multiply, but the field is nearly binary, so an island
 *   squared is still an island.
 * - `grassStandDensity` (per stem) packs the islands fuller and gathers their
 *   stems into tussocks, so a biome keeps roughly its configured mean density.
 *
 * Dense biomes (density near 1) are left exactly as they were.
 */
const PATCH_SEED = 0x2f6b1d;
/**
 * Seeds the canopy floor's grass islands apart from the biome's. The meadow
 * sampler thins stems with it and the forest-floor texture paints litter with
 * it, so the two agree on where the blades are.
 */
export const CANOPY_FLOOR_PATCH_SALT = 0x6f1;
const TUFT_SEED = 0x51c9a3;
/** Island and tussock wavelengths, in cells (2 m): ~11 m islands, ~4 m sub-islands. */
const ISLAND_CELLS = 5.5;
const SUB_ISLAND_CELLS = 2;
/** Tussocks, in metres. */
const TUFT_METERS = 1.15;
/** Canopy floor: the warp's wavelength and reach in cells, and its thinning band. */
const CANOPY_WARP_CELLS = 9;
const CANOPY_WARP_REACH_CELLS = 4;
const CANOPY_EDGE_BAND = 0.24;

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 0 for a full sward, 1 for the thinnest ground: how patchy a stand density grows. */
export function grassSparsity(density) {
  return smoothstep(0.9, 0.25, density);
}

/**
 * Share of a cell's grass habitat that is grass rather than bare ground.
 * @param {number} cellX canonical cell (fractional allowed)
 * @param {number} cellZ canonical cell
 * @param {number} density the biome's meadow density times its habitat edge
 * @param {number} seed world seed
 */
export function grassPatchCover(cellX, cellZ, density, seed = 0) {
  const sparsity = grassSparsity(density);
  if (sparsity <= 0) return 1;
  const noise = 0.5
    + valueNoise(cellX / ISLAND_CELLS, cellZ / ISLAND_CELLS, seed ^ PATCH_SEED) * 0.33
    + valueNoise(cellX / SUB_ISLAND_CELLS, cellZ / SUB_ISLAND_CELLS, (seed ^ PATCH_SEED) + 977) * 0.17;
  // The threshold rises as density falls, so roughly `density` of the ground
  // stays in islands.
  const threshold = 0.5 + 0.34 * (0.5 - density);
  const island = smoothstep(threshold - 0.09, threshold + 0.09, noise);
  return 1 - sparsity * (1 - island);
}

/**
 * The woodland floor's reading of the same idea, shared by the stems and the
 * litter they stand in. Unlike a biome's near-binary islands it is a slow
 * gradient: at the islands' narrow band, bare value noise draws long straight
 * contours that read as hard-edged lawns on soil, so the lattice is warped and
 * the stand thins across a wide band instead of stopping at a line.
 * @param {number} cellX canonical cell (fractional allowed)
 * @param {number} cellZ canonical cell
 * @param {number} density the canopy's grass density here
 * @param {number} seed world seed, salted with CANOPY_FLOOR_PATCH_SALT
 */
export function canopyFloorCover(cellX, cellZ, density, seed = 0) {
  const sparsity = grassSparsity(density);
  if (sparsity <= 0) return 1;
  const warpX = valueNoise(cellX / CANOPY_WARP_CELLS, cellZ / CANOPY_WARP_CELLS, seed ^ 0x4a7) * CANOPY_WARP_REACH_CELLS;
  const warpZ = valueNoise(cellX / CANOPY_WARP_CELLS, cellZ / CANOPY_WARP_CELLS, seed ^ 0x2c9) * CANOPY_WARP_REACH_CELLS;
  const noise = 0.5
    + valueNoise((cellX + warpX) / ISLAND_CELLS, (cellZ + warpZ) / ISLAND_CELLS, seed ^ PATCH_SEED) * 0.33
    + valueNoise((cellX + warpX) / SUB_ISLAND_CELLS, (cellZ + warpZ) / SUB_ISLAND_CELLS, (seed ^ PATCH_SEED) + 977) * 0.17;
  const threshold = 0.5 + 0.34 * (0.5 - density);
  return 1 - sparsity * (1 - smoothstep(threshold - CANOPY_EDGE_BAND, threshold + CANOPY_EDGE_BAND, noise));
}

/**
 * Acceptance density for one stem inside the islands: the biome's density,
 * raised where the islands have already taken the bare ground away, and
 * gathered into tussocks.
 * @param {number} x canonical metres
 * @param {number} z canonical metres
 * @param {number} density the biome's meadow density
 */
export function grassStandDensity(x, z, density, seed = 0) {
  const sparsity = grassSparsity(density);
  if (sparsity <= 0) return density;
  const filled = density + sparsity * (1 - density) * 0.92;
  const tuft = smoothstep(0.32, 0.62, valueNoise(x / TUFT_METERS, z / TUFT_METERS, seed ^ TUFT_SEED) * 0.5 + 0.5);
  return Math.min(1, filled * (1 - sparsity * 0.75 * (1 - tuft)) * (1 + sparsity * 0.25));
}

/**
 * A cell offset of up to `reach` cells, deterministic per stem position: what a
 * stem reads its biome from, so two biomes' grass mixes across their border
 * instead of switching at a cell edge. Triangular, so most stems still read
 * their own cell and a one-cell wetland strip keeps its reeds.
 */
export function ecotoneJitter(x, z, reach, out) {
  const ix = Math.round(x * 64);
  const iz = Math.round(z * 64);
  out.x = (hash2d(ix, iz, 0x3d1) + hash2d(ix, iz, 0x1b7) - 1) * reach;
  out.z = (hash2d(ix, iz, 0x7a5) + hash2d(ix, iz, 0x5e3) - 1) * reach;
  return out;
}
