import { vec2 } from 'three/tsl';
import { worldNoiseField } from '../../stylized/worldNoise.js';
import { WORLD_NOISE_LAYERS } from '../../stylized/worldNoiseLayout.js';
import { geometryNormal, triplanarWeights } from './LocationShading.js';

/**
 * Perlin-like noise read from the shared world-noise texture: a drop-in for
 * `mx_noise_float(p)` in location materials, at three texture taps a pixel in
 * place of a 3D Perlin's several hundred ALU. Same argument, same frequency,
 * same signed spread, so a swap keeps the look's thresholds.
 *
 * Only for noise that drives colour, masks, roughness or tint. Noise that
 * shapes geometry, agrees with CPU code, or is differentiated into a normal
 * (`bumpNormal`) stays procedural: an 8-bit texture's slope bands.
 *
 * Each field is one world-noise channel and the Perlin units its tile spans:
 * a 3D Perlin crosses its mean 0.83 times per unit, so a channel that crosses
 * its mean C times across the tile (measured on world-noise.png) spans C / 0.83.
 */
const PERLIN_CROSSINGS = 0.83;
const field = (layer, channel, crossings) => Object.freeze({
  layer: WORLD_NOISE_LAYERS[layer], channel, span: crossings / PERLIN_CROSSINGS,
});

export const NOISE = Object.freeze({
  /** Soft Perlin, few features a tile: regional zones and drift. */
  broad: field('macro', 'g', 9.7),
  /** Soft Perlin, more features a tile: patches a few metres across. */
  patch: field('macro', 'b', 26.8),
  /** Fine fBm: grain with its own small detail. */
  fbm: field('meso', 'r', 26.5),
  /** Mottle: blotches for stains, dirt and rust. */
  mottle: field('meso', 'g', 26.9),
  /** Grit: speckle and flecks. */
  grit: field('micro', 'r', 62.8),
  /** Clods and pits: bubbles, corrosion pits. */
  pits: field('micro', 'g', 79.8),
  /** Mud-plate cracks: dark branching lines on a light ground (not a Perlin; read it raw). */
  cracks: field('micro', 'b', 62.8),
});

/** mx_noise_float's spread (std 0.267, measured) over a channel's (0.2). */
export const SIGNED_GAIN = 0.267 / 0.2;
/** An irrational slant through the tile for one-coordinate noise, so a line of it never repeats. */
const SLANT = [Math.cos(0.5536), Math.sin(0.5536)];

const weights = triplanarWeights(geometryNormal);
const signed = (value) => value.sub(0.5).mul(SIGNED_GAIN);

/** Triplanar drop-in for `mx_noise_float(p)`, `p` in noise units along the world axes. */
export function locationNoise(kind, p) {
  return signed(triplanarNoise(kind, p, weights));
}

/**
 * The raw channel (0..1) projected three ways, `p` in noise units along the axes
 * `blend` weighs (triplanarWeights of the normal in `p`'s own frame).
 */
export function triplanarNoise(kind, p, blend) {
  const tap = worldNoiseField(kind.layer);
  const uv = p.div(kind.span);
  return tap(uv.zy)[kind.channel].mul(blend.x)
    .add(tap(uv.xz)[kind.channel].mul(blend.y))
    .add(tap(uv.xy)[kind.channel].mul(blend.z));
}

/** Drop-in for `mx_noise_float` of a 2D coordinate: a horizontal plane or a surface's own UV. */
export function planarNoise(kind, p) {
  return signed(worldNoiseField(kind.layer)(p.div(kind.span))[kind.channel]);
}

/** Drop-in for `mx_noise_float` along one coordinate `t`, offset by `salt` noise units. */
export function lineNoise(kind, t, salt) {
  return planarNoise(kind, vec2(t.mul(SLANT[0]), t.mul(SLANT[1]).add(salt)));
}
