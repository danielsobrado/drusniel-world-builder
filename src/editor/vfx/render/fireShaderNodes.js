import { clamp, int, mix, smoothstep, texture, vec2, vec3 } from 'three/tsl';
import { acquireWorldNoise } from '../../stylized/worldNoise.js';
import { WORLD_NOISE_LAYERS } from '../../stylized/worldNoiseLayout.js';

/**
 * Shared TSL fire-shading primitives built on the lazy world-noise texture
 * array (`acquireWorldNoise`): zero extra texture bindings and zero procedural
 * 3D fBm loops in fragment shaders.
 *
 * All noise terms are centred around 0.5 so flames stay whole and vivid even
 * during the brief idle window before `world-noise.png` finishes streaming in.
 */

const EMBER_DARK = vec3(0.32, 0.018, 0.003);
const FLAME_CRIMSON = vec3(0.95, 0.12, 0.01);
const FLAME_AMBER = vec3(1.0, 0.44, 0.042);
const FLAME_GOLD = vec3(1.0, 0.78, 0.22);
const FLAME_CORE = vec3(1.0, 0.96, 0.8);

/**
 * Physically motivated 5-stop blackbody thermal ramp in linear HDR space.
 * `heat` ∈ [0, 1]: 0 charred ember → 0.3 crimson → 0.55 amber → 0.8 gold → 1 white-hot core.
 */
export function blackbodyFireColor(heat) {
  const h = clamp(heat, 0, 1);
  let colour = mix(EMBER_DARK, FLAME_CRIMSON, smoothstep(0.0, 0.24, h));
  colour = mix(colour, FLAME_AMBER, smoothstep(0.22, 0.52, h));
  colour = mix(colour, FLAME_GOLD, smoothstep(0.5, 0.78, h));
  return mix(colour, FLAME_CORE, smoothstep(0.76, 1.0, h));
}

/**
 * Tints the blackbody thermal ramp with custom `outer` and `core` colours
 * (used by location flames whose generators pass warm/amber/forged overrides)
 * while preserving the rich crimson fringe and incandescent heart.
 */
export function tintedBlackbodyFireColor(heat, outerColor, coreColor) {
  const h = clamp(heat, 0, 1);
  const deepEdge = outerColor.mul(vec3(0.75, 0.22, 0.08));
  const midOrange = mix(outerColor, coreColor, 0.32);
  let colour = mix(deepEdge, outerColor, smoothstep(0.0, 0.28, h));
  colour = mix(colour, midOrange, smoothstep(0.26, 0.6, h));
  colour = mix(colour, coreColor, smoothstep(0.58, 0.88, h));
  return mix(colour, mix(coreColor, FLAME_CORE, 0.55), smoothstep(0.86, 1.0, h));
}

/** One tap of the shared world-noise array on the `sky` or `meso` layer. */
export function sampleFireNoise(uvCoord, layer = 'sky') {
  return texture(acquireWorldNoise().texture, uvCoord).depth(int(WORLD_NOISE_LAYERS[layer]));
}

/**
 * Dual-stage domain-warped upward fire turbulence using the `sky` layer:
 *   R = Voronoi billow cells (for cellular combustion pockets & crisp licks)
 *   G = Super-Perlin wisps (for broad buoyant flame sway)
 *   B = Turbulence erosion (for fine curling flame filaments & tip breakup)
 *
 * Returns centred signed signals (`sway`, `licks`, `detail` in roughly -0.6..0.6)
 * plus unsigned `cells` and `erosion` (0..1, 0.5 on neutral noise).
 */
export function sampleFireTurbulence(uvCoord, scrollTime, patchOffset, {
  broadScale = vec2(0.42, 0.34),
  fineScale = vec2(0.86, 0.68),
  broadSpeed = 0.36,
  fineSpeed = 0.62,
  warpStrength = 0.14,
  gain = 1.35,
} = {}) {
  const broadUv = uvCoord.mul(broadScale)
    .add(vec2(scrollTime.mul(0.025), scrollTime.mul(-broadSpeed)))
    .add(patchOffset);
  const broad = sampleFireNoise(broadUv, 'sky');
  const sway = broad.g.sub(0.5).mul(gain);
  const broadCells = broad.r;

  const fineUv = uvCoord.mul(fineScale)
    .add(vec2(sway.mul(warpStrength), scrollTime.mul(-fineSpeed)))
    .sub(patchOffset.mul(0.73));
  const fine = sampleFireNoise(fineUv, 'sky');
  const licks = fine.b.sub(0.5).mul(gain);
  const fineCells = fine.r;

  const cells = mix(broadCells, fineCells, 0.55);
  const erosion = clamp(mix(fine.b, broad.g, 0.35), 0, 1);
  const combined = sway.mul(0.6).add(licks.mul(0.4));

  return { sway, licks, cells, erosion, combined };
}
