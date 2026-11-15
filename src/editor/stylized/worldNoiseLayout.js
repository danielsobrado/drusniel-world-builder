/**
 * The world-noise texture's layout, shared by the packer
 * (scripts/pack-noise-textures.mjs) and the runtime (worldNoise.js). Each layer
 * holds three greyscale noises in R, G and B; all tile.
 *
 *   macro  slow fields for colour drift and patches (R ~500 m, G ~85 m, B ~36 m at a 512 m period)
 *   meso   R fine fBm, G mottle, B oriented streak
 *   micro  R grit, G clods and pits, B mud-plate cracks
 *   water  R foam lace, G caustic web, B soft field
 *   sky    R billow, G wisp, B erosion (also VFX)
 */
export const WORLD_NOISE_LAYER_NAMES = Object.freeze(['macro', 'meso', 'micro', 'water', 'sky']);
export const WORLD_NOISE_LAYERS = Object.freeze(
  Object.fromEntries(WORLD_NOISE_LAYER_NAMES.map((name, index) => [name, index])),
);
export const WORLD_NOISE_SIZE = 256;
/** Metres one repeat of a layer spans where it is laid over the world. */
export const WORLD_NOISE_METERS = Object.freeze({ macro: 512, meso: 32, micro: 8, water: 16 });
/** A second macro tap at this scale and turn, so the first one's repeat never shows from the air. */
export const WORLD_NOISE_SECOND = Object.freeze({ scale: 0.618, turn: 0.6458 });
