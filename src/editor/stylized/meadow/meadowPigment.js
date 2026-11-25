import { cameraPosition, color, dot, float, fract, mix, pow, smoothstep, uv, vec2, vec3, vec4 } from 'three/tsl';

import { stormSnowCoverAtCanonical } from '../../weather/storm/snowField/snowFieldState.js';
import { canopySnowColor } from '../forest/canopySnow.js';
import { stylizedPathWearMask } from '../StylizedNoiseNodes.js';
import { meadowCanopyColor, meadowCanopyView } from './meadowCanopy.js';
import { worldNoiseField } from '../worldNoise.js';
import { WORLD_NOISE_LAYERS } from '../worldNoiseLayout.js';
import { meadowPatchColors } from './meadowColorNodes.js';
import { applyGrassMarks } from './meadowGrassMarks.js';
import { MEADOW_GRASS_DEFAULTS } from './meadowGrassConfig.js';
import { meadowShortStand } from './meadowGrowthNodes.js';
import { applyMeadowGroundStyle, meadowGroundStyle } from './meadowGroundStyle.js';
import { meadowStandNodes } from './meadowStandNodes.js';
import { meadowTuftNodes } from './meadowTuftNodes.js';
import { sampleWorldSurfaceContextAt } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { resolveTerrainWorldNoiseMean } from '../worldSurfaceContext/TerrainSurfaceEvaluator.js';

/** Environmental terrain-color coupling on blade roots (open meadow vs woodland canopy). */
const ENV_ROOT_SHARE_OPEN = 0.30;
const ENV_ROOT_SHARE_CANOPY = 0.68;
/** Relative share of environmental coupling carried into upper tips (keeps tips lively). */
const ENV_TIP_RATIO = 0.62;
/** Tip lift relative to local terrain surface when anchoring blades in shade. */
const ENV_TIP_LIFT = 1.15;
/** Direct terrain-albedo match at the blade foot (height = 0) without double root darkening. */
const FOOT_CONTACT_SHARE = 0.82;
/** Share of terrain world-noise reflectance mean applied across all distances (matches Standard IBL terrain). */
const WORLD_NOISE_HARMONY_SHARE = 0.85;

const DEFAULT_PATH_FRINGE_COLOR = '#c2ad62';
const DEFAULT_PATH_FRINGE_STRENGTH = 0.55;
/** A seed stem's ripe tip. */
const STRAW_SEED = '#d6c088';

/**
 * The meadow pigment, after grass-test's `#configureMeadowMaterial`: a root that
 * stays dark most of the way up and a lit tip, drifting between cool and warm
 * patches across the field; a value shared by each tuft's stems so plants read
 * as one; contact shade and soil at the base so blades meet
 * the ground rather than float on a painted lawn; a per-blade value spread that
 * separates overlapping blades into layers instead of one flat sheet; straw tips
 * along a path's verge; and, with `marks`, the scorch, frost or blight a spell
 * left on the blades.
 *
 * Past `meltStart` the per-stem detail (tuft and blade value, contact shade,
 * soil foot) melts away and the gradient flattens toward the canopy colour, so
 * a distant stand reads as one lit surface with the ground's own value instead
 * of a speckle of separate spikes. `melted` forces it fully on (far cards).
 */
export function meadowPigment({ uniforms, tuning, config, blade, marks = false, melted = false, height = uv().y.clamp(0, 1) }) {
  const appearance = uniforms.appearance;
  const patchSettings = { ...MEADOW_GRASS_DEFAULTS.appearance, ...config.grass?.meadow?.appearance };
  const { tint, dry, dryColor } = meadowPatchColors(blade.canonical, patchSettings, {
    patchScale: appearance.patchScale, patchCool: uniforms.patchCool, patchWarm: uniforms.patchWarm,
    noiseField: worldNoiseField(WORLD_NOISE_LAYERS.macro),
  });
  const palette = uniforms.palette;
  const index = blade.palette.toInt();
  const lush = palette ? palette.lush.element(index) : float(1);
  const bottom = palette ? palette.base.element(index) : tuning.colorBottom;
  const top = palette ? palette.tip.element(index) : tuning.colorTop;
  const brightness = palette?.brightness ?? tuning.brightness;
  // These fields are constant along a stem. Evaluate their noise at vertices,
  // then interpolate pigment instead of repeating it in every covered fragment.
  const patchTint = mix(vec3(1), tint, lush);
  let root = mix(mix(bottom, top, appearance.groundTipMix).mul(patchTint), dryColor, dry);
  let tip = mix(top.mul(patchTint), dryColor.mul(1.06), dry.mul(0.45));
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
  const stand = meadowStandNodes(
    blade.canonical, blade.rank, uniforms.growth.accents.element(blade.growth.toInt().add(32)),
  );
  root = root.mul(stand.rootTone);
  tip = mix(tip.mul(stand.tipTone), color(STRAW_SEED).mul(dot(tip, vec3(0.3, 0.59, 0.11)).mul(1.1).add(0.45)), stand.seedStem.mul(0.75));
  if (uniforms.groundStyle) {
    const style = meadowGroundStyle(blade.canonical, uniforms.groundStyle.mul(uniforms.growth.areaStyle.element(blade.growth.toInt())));
    ({ root, tip } = applyMeadowGroundStyle(root, tip, { ...style, lush: style.lush.mul(lush) }));
  }
  const tufts = uniforms.tufts;
  const occupancy = meadowTuftNodes(blade.canonical).occupancy;
  const melt = melted ? float(1) : smoothstep(appearance.meltStart, appearance.meltEnd, cameraPosition.distance(blade.base));
  const tuftValue = mix(occupancy.sub(0.5).mul(tufts.valueSpread.mul(2)).add(1), float(1), melt);
  root = root.mul(tuftValue);
  tip = tip.mul(tuftValue);
  if (marks && uniforms.spellGround) ({ root, tip } = applyGrassMarks(uniforms.spellGround, blade.base, root, tip));
  // A storm's snow settles on the blades as it does on the ground and crowns (SnowCover):
  // tips whiten first, roots keep a little green.
  const stormCover = stormSnowCoverAtCanonical(blade.canonical);
  root = mix(root, canopySnowColor.mul(0.8), stormCover.mul(0.6));
  tip = mix(tip, canopySnowColor, stormCover.mul(0.9));
  // Apply palette brightness + shared terrain world-noise reflectance harmony
  // BEFORE WSC surface anchoring so wsc.albedo is never double-scaled and far
  // cards outside the 128 m WSC window stay matched with zero border ring.
  const wnMean = resolveTerrainWorldNoiseMean(config);
  const wnHarmony = vec3(
    1 + (wnMean[0] - 1) * WORLD_NOISE_HARMONY_SHARE,
    1 + (wnMean[1] - 1) * WORLD_NOISE_HARMONY_SHARE,
    1 + (wnMean[2] - 1) * WORLD_NOISE_HARMONY_SHARE,
  );
  root = root.mul(brightness).mul(wnHarmony);
  tip = tip.mul(brightness).mul(wnHarmony);

  // Sample canonical World Surface Context once in vertex stage (zero extra samplers).
  const wsc = sampleWorldSurfaceContextAt(blade.canonical, { canonical: true });
  // Single-counted trunk/rock contact occlusion (removes DS-01 canopy double-darkening).
  const contactAo = float(1).sub(wsc.contact.mul(0.26)).clamp(0.65, 1);
  // Environmental surface coupling: anchors woodland & patchy-ground blades into the
  // resolved terrain reflectance family while preserving lively sunlit tips.
  const envShare = wsc.validity.mul(mix(float(ENV_ROOT_SHARE_OPEN), float(ENV_ROOT_SHARE_CANOPY), wsc.canopy));
  const wscTipTarget = wsc.albedo.mul(ENV_TIP_LIFT).clamp(0, 1);
  root = mix(root, wsc.albedo, envShare).mul(contactAo);
  tip = mix(tip, wscTipTarget, envShare.mul(ENV_TIP_RATIO)).mul(mix(float(1), contactAo, float(0.5)));

  // Pack resolved WSC terrain albedo + validity into one vec4 varying; eco canopy +
  // effective vegetation coverage into one compact vec2 varying.
  const footSurface = vec4(wsc.albedo, wsc.validity).toVarying('meadowFootSoil');
  const wscEco = vec2(wsc.canopy, wsc.vegetationCoverage).toVarying('meadowWscEco');
  // Occupancy rides in the root varying's fourth lane: no extra vertex output.
  const rootData = vec4(root, occupancy).toVarying('meadowRootPigment');
  root = rootData.xyz;
  // Melt rides in the tip varying's fourth lane.
  const tipData = vec4(tip, melt).toVarying('meadowTipPigment');
  tip = tipData.xyz;
  const melting = tipData.w;
  const canopyColor = meadowCanopyColor(root, tip, appearance.canopyTipMix);
  // A short stem has no sward over its root: the whole blade is lit, so painting
  // most of it as root is what turned it into a black spike on sunlit ground.
  const short = meadowShortStand(uniforms.growth.dimensions.element(blade.growth.toInt()).y).toVarying('meadowShortStand');
  const gradient = mix(pow(height, appearance.gradientPower), height.sqrt(), short);
  const pigment = mix(mix(root, tip, gradient), canopyColor, melting.mul(appearance.meltFlatten));
  // Self-occlusion inside dense tufts only: sparse woodland blades (`1 - vegetationCoverage`)
  // and isolated tuft stragglers lift toward 1 so they never punch dark dots into litter.
  const sparseLift = float(1).sub(wscEco.y).mul(footSurface.w).mul(0.75);
  const rootFloor = mix(
    appearance.rootBrightness,
    float(1),
    float(1).sub(rootData.w).mul(tufts.rootLift).max(short).max(sparseLift),
  );
  // Keep vertical mean luminance conserved when `melting` flattens rootShade across LOD bands.
  const meltedShade = mix(rootFloor, float(1), float(0.65));
  const rootShade = mix(mix(rootFloor, 1, smoothstep(0, appearance.canopyDepth.max(0.01), height)), meltedShade, melting);
  const variation = mix(mix(vec3(0.93, 1, 0.9), vec3(1.07, 1, 0.86), blade.variation), vec3(1), melting);
  const bladeValue = mix(fract(blade.rank.mul(0.618034)).sub(0.5).mul(appearance.valueJitter).add(1), float(1), melting);
  const stemColor = pigment.mul(rootShade).mul(variation).mul(bladeValue);
  // Foot meets exact resolved terrain reflectance (wsc.albedo) AFTER rootShade so
  // roots never double-darken against the ground, leaning toward canopy at grazing view.
  const footTarget = mix(footSurface.xyz, canopyColor, meadowCanopyView(appearance.canopyStrength).mul(0.45));
  const footReach = smoothstep(0, 0.24, height).oneMinus().mul(footSurface.w).mul(float(1).sub(melting.mul(0.5)));
  const finalColor = mix(stemColor, footTarget, footReach.mul(FOOT_CONTACT_SHARE));
  return {
    pigment,
    bladeValue,
    rootShade,
    canopy: wscEco.x.clamp(0, 1),
    vegetationCoverage: wscEco.y.clamp(0, 1),
    color: finalColor,
    height,
  };
}
