import { color, float, texture, vec3 } from 'three/tsl';
import { acquireRockTextures } from '../world/FarAlpineSurface.js';

/**
 * The crags' cold stone, which puts a scattered stone in snow country. The snow
 * lying on it is the terrain's own Snow007C coat (surfaceCoatings/SnowCoat.js).
 */
const STONE_METERS = 7;
/** Dark, barely blue: stone in snow reads by contrast, and the old light blue-grey looked like ice. */
const STONE_TINT = '#7c8188';
const STONE_GAIN = 1.35;

/** Triplanar crag stone at world point `p` (metres) with world normal `n`: blue-grey, ~0..1 albedo. */
export function coldStone(p, n) {
  const maps = acquireRockTextures();
  const blend = n.abs().pow(vec3(4)).toVar();
  const weights = blend.div(blend.x.add(blend.y).add(blend.z)).toVar();
  const scale = float(1 / STONE_METERS);
  return texture(maps.color, p.zy.mul(scale)).rgb.mul(weights.x)
    .add(texture(maps.color, p.xz.mul(scale)).rgb.mul(weights.y))
    .add(texture(maps.color, p.xy.mul(scale)).rgb.mul(weights.z))
    .mul(color(STONE_TINT)).mul(STONE_GAIN);
}
