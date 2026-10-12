/**
 * Layout of the one particle atlas: a 512² texture of 8×8 tiles, 64 px each,
 * rasterised at startup. Row 7 holds eight colour ramps instead of tiles.
 *
 * Channel convention for every shape tile:
 *   R, G  billboard-space normal xy, encoded `n * 0.5 + 0.5`
 *   B     detail / heat mask (hot core, ember cracks, glints)
 *   A     coverage
 */
export const ATLAS_SIZE = 512;
export const TILE_SIZE = 64;
export const TILES_PER_ROW = ATLAS_SIZE / TILE_SIZE;
/** Texels kept clear round each tile so mips do not bleed neighbours in. */
export const TILE_PADDING_PX = 2;

export const TILE = Object.freeze({
  SMOKE_FIRST: 0,
  SMOKE_LAST: 11,
  FIRE_FIRST: 12,
  FIRE_LAST: 19,
  GLOW: 20,
  FLARE: 21,
  STREAK: 22,
  RING_THIN: 23,
  RING_SOFT: 24,
  BEAM: 25,
  BOLT: 26,
  DROPLET: 27,
  CHUNK_FIRST: 28,
  CHUNK_LAST: 33,
  SHARD_FIRST: 34,
  SHARD_LAST: 35,
  SCORCH_FIRST: 36,
  SCORCH_LAST: 39,
  FROST_DECAL: 40,
  RUNE_CIRCLE: 41,
  ACID_SPLAT: 42,
  BLIGHT_DECAL: 43,
  BUBBLE: 44,
  MOTE: 45,
  FLAME_FIRST: 46,
  FLAME_LAST: 49,
  CRACKS: 50,
  WISP: 51,
  ASH: 52,
  CLOUD: 53,
  SNOWFLAKE: 54,
  TWINKLE: 55,
});

/** Ramps occupy row 7: eight horizontal strips, 8 texels tall, 512 wide. */
export const RAMP = Object.freeze({
  BLACKBODY: 0,
  FROST: 1,
  ACID: 2,
  ARCANE: 3,
  NECROTIC: 4,
  HOLY: 5,
  LIGHTNING: 6,
  MOON: 7,
});
export const RAMP_ROW = 7;
export const RAMP_COUNT = 8;
export const RAMP_HEIGHT_PX = TILE_SIZE / RAMP_COUNT;

/** Inclusive tile span for flipbooks and random picks. */
export function tileSpan(first, last) {
  return Object.freeze([first, last]);
}

export const TILE_SPANS = Object.freeze({
  smoke: tileSpan(TILE.SMOKE_FIRST, TILE.SMOKE_LAST),
  fire: tileSpan(TILE.FIRE_FIRST, TILE.FIRE_LAST),
  chunk: tileSpan(TILE.CHUNK_FIRST, TILE.CHUNK_LAST),
  shard: tileSpan(TILE.SHARD_FIRST, TILE.SHARD_LAST),
  scorch: tileSpan(TILE.SCORCH_FIRST, TILE.SCORCH_LAST),
  flame: tileSpan(TILE.FLAME_FIRST, TILE.FLAME_LAST),
});
