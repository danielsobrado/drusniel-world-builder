import { clamp, float, floor, mod, texture, vec2 } from 'three/tsl';
import {
  ATLAS_SIZE,
  RAMP_HEIGHT_PX,
  RAMP_ROW,
  TILE_SIZE,
  TILES_PER_ROW,
} from '../atlas/ParticleAtlasLayout.js';

const INSET = 1 / TILE_SIZE;
const INNER = 1 - 2 * INSET;

/** Atlas UV of `localUv` (0..1) inside tile `tile` (integer-valued float). */
export function atlasTileUv(tile, localUv) {
  const column = mod(tile, TILES_PER_ROW);
  const row = floor(tile.div(TILES_PER_ROW));
  return vec2(column, row).add(localUv.mul(INNER).add(INSET)).div(TILES_PER_ROW);
}

/**
 * Ramp lookup at `heat` ∈ [0, 1]. Always mip 0: the ramps share the atlas
 * with tiles, and a lower mip would blur neighbouring ramps together.
 */
export function sampleRamp(atlas, ramp, heat) {
  const u = clamp(heat, 0, 1).mul((ATLAS_SIZE - 1) / ATLAS_SIZE).add(0.5 / ATLAS_SIZE);
  const v = float(RAMP_ROW * TILE_SIZE + RAMP_HEIGHT_PX * 0.5).add(ramp.mul(RAMP_HEIGHT_PX)).div(ATLAS_SIZE);
  return texture(atlas, vec2(u, v)).level(0);
}
