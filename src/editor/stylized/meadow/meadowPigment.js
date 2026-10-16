import { color, dot, float, fract, mix, pow, smoothstep, uv, vec3, vec4 } from 'three/tsl';

import { stylizedPathWearMask } from '../StylizedNoiseNodes.js';
import { meadowPatchColors } from './meadowColorNodes.js';
import { applyGrassMarks } from './meadowGrassMarks.js';
import { MEADOW_GRASS_DEFAULTS } from './meadowGrassConfig.js';
import { meadowTuftNodes } from './meadowTuftNodes.js';

/** Share of the root pigment the stem's foot keeps where it meets the soil. */
const SOIL_SHARE = 0.88;

const DEFAULT_PATH_FRINGE_COLOR = '#c2ad62';
const DEFAULT_PATH_FRINGE_STRENGTH = 0.55;

/**
 * The meadow pigment, after grass-test's `#configureMeadowMaterial`: a root that
 * stays dark most of the way up and a lit tip, drifting between cool and warm
 * patches across the field; a value shared by each tuft's stems so plants read
 * as one; contact shade and soil at the base so blades meet
 * the ground rather than float on a painted lawn; a per-blade value spread that
 * separates overlapping blades into layers instead of one flat sheet; straw tips
 * along a path's verge; and, with `marks`, the scorch, frost or blight a spell
 * left on the blades.
 */
export function meadowPigment({ uniforms, tuning, config, blade, marks = false }) {
  const appearance = uniforms.appearance;
  const height = uv().y.clamp(0, 1);
  const patchSettings = { ...MEADOW_GRASS_DEFAULTS.appearance, ...config.grass?.meadow?.appearance };
  const { tint, dry, dryColor } = meadowPatchColors(blade.canonical, patchSettings, {
    patchScale: appearance.patchScale, patchCool: uniforms.patchCool, patchWarm: uniforms.patchWarm,
  });
  const palette = uniforms.palette;
  const index = blade.palette.toInt();
  const bottom = palette ? palette.base.element(index) : tuning.colorBottom;
  const top = palette ? palette.tip.element(index) : tuning.colorTop;
  const brightness = palette?.brightness ?? tuning.brightness;
  // These fields are constant along a stem. Evaluate their noise at vertices,
  // then interpolate pigment instead of repeating it in every covered fragment.
  let root = mix(mix(bottom, top, appearance.groundTipMix).mul(tint), dryColor, dry);
  let tip = mix(top.mul(tint), dryColor.mul(1.06), dry.mul(0.45));
  const fringe = config.path?.fringe ?? {};
  if (fringe.enabled !== false) {
    const wear = stylizedPathWearMask(blade.path, blade.canonical, {
      vergeWidth: config.path?.vergeWidth ?? 0.45,
      vergeCut: config.path?.vergeCut ?? 0.72,
      edgeScale: config.path?.edgeScale ?? 0.42,
      edgeWarp: config.path?.edgeWarp ?? 0.18,
    });
    const straw = color(fringe.color ?? DEFAULT_PATH_FRINGE_COLOR)
      .mul(dot(tip, vec3(0.3, 0.59, 0.11)).mul(1.6).add(0.35));
    tip = mix(tip, straw, wear.verge.mul(fringe.strength ?? DEFAULT_PATH_FRINGE_STRENGTH).clamp(0, 1));
  }
  const tufts = uniforms.tufts;
  const occupancy = meadowTuftNodes(blade.canonical).occupancy;
  const tuftValue = occupancy.sub(0.5).mul(tufts.valueSpread.mul(2)).add(1);
  root = root.mul(tuftValue);
  tip = tip.mul(tuftValue);
  if (marks && uniforms.spellGround) ({ root, tip } = applyGrassMarks(uniforms.spellGround, blade.base, root, tip));
  // Occupancy rides in the root varying's fourth lane: no extra vertex output.
  const rootData = vec4(root, occupancy).toVarying('meadowRootPigment');
  root = rootData.xyz;
  tip = tip.toVarying('meadowTipPigment');
  const pigment = mix(root, tip, pow(height, appearance.gradientPower));
  // Contact darkening belongs to dense interiors; an isolated stem's foot stays
  // near the ground's own value instead of punching a dark dot into it.
  const rootFloor = mix(appearance.rootBrightness, float(1), float(1).sub(rootData.w).mul(tufts.rootLift));
  const rootShade = mix(rootFloor, 1, smoothstep(0, appearance.canopyDepth.max(0.01), height));
  const soil = root.mul(SOIL_SHARE);
  const based = mix(soil, pigment, smoothstep(0, 0.18, height));
  const variation = mix(vec3(0.93, 1, 0.9), vec3(1.07, 1, 0.86), blade.variation);
  const bladeValue = fract(blade.rank.mul(0.618034)).sub(0.5).mul(appearance.valueJitter).add(1);
  return {
    pigment,
    bladeValue,
    color: based.mul(rootShade).mul(variation).mul(bladeValue).mul(brightness),
    height,
  };
}
