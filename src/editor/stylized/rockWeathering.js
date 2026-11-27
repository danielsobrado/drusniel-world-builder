import { frameUniform } from '../../render/FrameUniforms.js';
import {
  attribute,
  cameraPosition,
  cameraViewMatrix,
  color,
  dot,
  float,
  materialNormal,
  mx_noise_float,
  mix,
  normalView,
  normalWorld,
  normalWorldGeometry,
  normalize,
  positionGeometry,
  positionLocal,
  positionView,
  positionWorld,
  sin,
  smoothstep,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { stylizedFbm2 } from './StylizedNoiseNodes.js';
import { worldNoiseField } from './worldNoise.js';
import { WORLD_NOISE_LAYERS } from './worldNoiseLayout.js';
import { LOOK_SNOW_STEPS } from '../biomes/BiomeLooks.js';
import { authoredTexture } from './AuthoredTextureNode.js';
import { coldStoneSurface, rockFractureDetail } from './rockSnowSurface.js';
import { blendCoat, coatDetailFade } from '../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { PREVAILING_WIND } from '../materials/SnowAccumulation.js';
import { snowLightUniforms } from './sky/skyLight.js';
import { mossCoat } from './surfaceCoatings/MossCoat.js';
import { mossGrowth } from './surfaceCoatings/MossGrowthMask.js';
import { snowCoat } from './surfaceCoatings/SnowCoat.js';
import { surfaceCoatings } from './surfaceCoatings/SurfaceCoatingConfig.js';
import { SNOW_GROUND_COLOR, snowDeposition } from './snowDeposition.js';
import { stormSnowCoverAt } from '../weather/storm/snowField/snowFieldState.js';
import { sampleCoastalRockImpactState } from './CoastalRockImpactStateNodes.js';
import { sampleWorldSurfaceContextVarying } from './worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact, publishGroundContact } from './worldSurfaceContext/WorldSurfaceContactNodes.js';
import { publishCoatCoverage } from './surfaceCoatings/CoatCoverage.js';

/**
 * Weathering for the authored rock pack — after grass-test's `rockWeathering`.
 *
 * Broken moss, dust and local wetness integrate authored stones with the ground.
 * Toning is configurable because source packs have different painted values;
 * contact darkening stays modest alongside Lambert lighting and scene AO.
 *
 * The streamed rock view resolves each stone's nearest water body once during
 * placement. Its packed instance attribute supplies level and eligibility, so
 * rivers and raised lakes carry their own splash lines without a GPU water field.
 *
 * The donor also dithered rocks away in front of the character. This project's
 * `CharacterOcclusion` deliberately cuts foliage only — rocks are solid obstacles
 * and cutting them reads as a hole in the world — so the mask is left alone.
 */

/**
 * The donor's tone and moss frequencies are per unit of its world, 2.8 to the
 * metre. Read per metre they gave a 2.5 m stone one flat tone and either no moss
 * or a solid cap; converted, a stone carries the donor's broken patches again.
 */
const DONOR_UNITS_PER_METRE = 2.8;
/** Per-placement shift of the pattern, per unit of the instance seed (0..1). */
const SEED_SPREAD = Object.freeze([131.7, 71.3, 97.9]);

/**
 * Where a fragment sits in the weathering pattern: the stone's own (object-space)
 * position, shifted by its placement's stable seed. Render-space position moved
 * with every floating-origin rebase, so each stone's tone and moss jumped when the
 * player walked far enough; object space does not move, and the seed keeps
 * stones sharing one template from reading as copies. The rock view draws only
 * instanced meshes, which always carry `instanceDither` (y is the seed).
 */
function patternPosition() {
  const seed = attribute('instanceDither', 'vec3').y;
  return positionGeometry.add(vec3(...SEED_SPREAD).mul(seed));
}

/**
 * World-metre position relative to the instance's pivot, shifted by its seed.
 * Preserves identical texel density per metre across 0.9x pebbles and 8.5x
 * formation keystones without ever swimming across floating-origin snaps.
 */
function metricPatternPosition(rootNode, fallback) {
  if (!rootNode) return fallback;
  const seed = attribute('instanceDither', 'vec3').y;
  return varying(positionLocal.sub(rootNode)).add(vec3(...SEED_SPREAD).mul(seed));
}

const DUST = '#a89a80';
const ALGAE = '#4a5a2a';
const ROCK_SNOW = '#eef3f8';
/** How far snow country turns a boulder to fractured alpine stone, and how much macro shading it keeps. */
const FROST_STONE = 0.92;
const FROST_SHADING = 1.65;
/** Rock snow's roughness when the snow coat is off. */
const PLAIN_SNOW_ROUGHNESS = 0.78;
/** Soil-line noise frequency: a few lobes round a metre-scale boulder. */
const SOIL_EDGE_PER_METRE = 1.1;

export const DEFAULT_ROCK_WEATHERING = Object.freeze({
  enabled: true,
  // Multiplies source albedo; the current mid-value pack overrides this to .92.
  toning: 0.72,
  moss: 0.55,
  dust: 0.35,
  undersideShade: 0.2,
  waterline: 0.7,
  // Metres above the water the splash line reaches, ragged by the noise.
  waterlineHeight: 1.2,
  wetDarkening: 0.5,
  /** Green in the upper half of the splash band, where a tide mark grows. */
  algae: 0.45,
  algaeColor: ALGAE,
  /** Ground duff carried up the stone's foot; 0 leaves the foot bare. */
  soil: 0.7,
  /** How far up it reaches, as a share of the stone's height above the ground line. */
  soilHeight: 0.16,
  // The linear value of terrainMaterial's contact-shade earth, so foot and floor agree.
  soilColor: '#7b653d',
});

/**
 * @param {object} [configured] `stylizedSurface.rocks.weathering`
 */
export function resolveRockWeathering(configured) {
  if (configured?.enabled === false) return null;
  const settings = { ...DEFAULT_ROCK_WEATHERING, ...(configured ?? {}) };
  for (const key of ['toning', 'moss', 'dust', 'waterline', 'algae', 'undersideShade', 'soil']) {
    const value = Number(settings[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Invalid editor configuration: rocks.weathering.${key} must be within [0, 1].`);
    }
  }
  for (const key of ['waterlineHeight', 'soilHeight']) {
    if (!(Number(settings[key]) > 0)) {
      throw new Error(`Invalid editor configuration: rocks.weathering.${key} must be positive.`);
    }
  }
  return settings;
}

/**
 * Rewrites a cloned rock material's albedo and roughness in place.
 *
 * @param {object} material a cloned MeshStandardNodeMaterial
 * @param {object} options
 * @param {object} options.settings resolved weathering settings
 * @param {number|null} [options.seaLevel] world sea level, for the splash line
 * @param {boolean} [options.biomeLook] read the per-instance `instanceBiomeLook`
 *   (rgb albedo multiplier, moss scale) the rock view writes from each stone's biome
 * @param {{ groundY: number, height: number, centre: number[] }} [options.ground]
 *   the stone's object-space ground line, height above it and centre, for the
 *   snow skirt, lee drift and cavities (snowDeposition)
 */
export function applyRockWeathering(material, {
  settings,
  seaLevel = null,
  localWater = false,
  biomeLook = false,
  ground = null,
  impactSettings = null,
  rootNode = null,
}) {
  if (!settings?.enabled) return material;
  const sourceMap = material.map ?? null;
  const world = positionWorld;
  const pattern = patternPosition();
  const metricPattern = metricPatternPosition(rootNode, pattern);
  const look = biomeLook ? attribute('instanceBiomeLook', 'vec4') : null;
  // w = moss + 4 * snow steps (BiomeLooks LOOK_SNOW_STEPS).
  const snowSteps = look ? look.w.div(4).floor() : null;
  const moss = look ? look.w.sub(snowSteps.mul(4)) : null;
  const snowGround = look ? snowSteps.div(LOOK_SNOW_STEPS) : null;
  const donor = pattern.mul(DONOR_UNITS_PER_METRE);

  // Broad tonal breakup from sine products over the stone, so stones sharing one
  // template stop reading as copies of each other.
  const tone = sin(donor.x.mul(0.83).add(sin(donor.y.mul(1.31)).mul(1.6)))
    .mul(sin(donor.z.mul(0.97).add(sin(donor.x.mul(0.61)).mul(1.2))))
    .mul(sin(donor.y.mul(0.71).add(donor.z.mul(0.37))))
    .mul(0.5).add(0.5);
  const rawSource = sourceMap ? authoredTexture(sourceMap).rgb : vec3(1);
  // In arid/mossless biomes (`moss === 0`, e.g. hot desert, cold steppe, savanna, badlands),
  // neutralize the green forest-moss blotches baked into the donor rock atlas so sandstone
  // and steppe boulders never show painted green moss patches.
  const sourceLuma = dot(rawSource, vec3(0.3, 0.59, 0.11));
  const cleanSource = look
    ? mix(vec3(sourceLuma), rawSource, moss.smoothstep(0.0, 0.25).mul(0.75).add(0.25))
    : rawSource;
  const albedo = cleanSource
    .mul(color(material.color.getHex()))
    .mul(settings.toning)
    .mul(mix(0.74, 1.06, tone));
  const biomeAlbedo = look ? albedo.mul(look.rgb) : albedo;

  // Organic 3D FBM moss mats in world metres so 8.5x rock formations keep crisp moss scale.
  const macroPatch = stylizedFbm2(metricPattern.xz.mul(1.75).add(metricPattern.y.mul(0.65))).mul(0.5).add(0.5);
  // Fringe, tuft grain and clump tone from the world noise, mapped from above and
  // from the side and blended by the facet's slope: four taps in place of three
  // 3D Perlins a pixel. The micro layer's pits break the moss edge, its grit is
  // the tufts; the meso mottle groups them into clumps.
  const noiseAt = (layer, metres) => {
    const field = worldNoiseField(layer);
    const flat = field(metricPattern.xz.div(metres));
    const side = field(vec2(metricPattern.x.add(metricPattern.z), metricPattern.y).div(metres).add(0.37));
    return mix(side, flat, normalWorld.y.abs().smoothstep(0.35, 0.75));
  };
  const micro = noiseAt(WORLD_NOISE_LAYERS.micro, 2.5);
  const edgeBreakup = micro.g;
  const tuftGrain = micro.r;
  const clumpTone = noiseAt(WORLD_NOISE_LAYERS.meso, 6).g;
  const up = normalWorld.y;
  const rockLuma = dot(biomeAlbedo, vec3(0.3, 0.59, 0.11));
  // Bias moss toward stone crevices/darker grain while keeping upward-facing growth.
  const creviceBias = rockLuma.smoothstep(0.16, 0.62).oneMinus().mul(0.18);
  const patchField = macroPatch.mul(0.64).add(edgeBreakup.mul(0.36)).add(creviceBias);
  // Orientation from the geometric normal: the authored normal map's bumps
  // would otherwise speckle the mat's edge. Taper smoothly off steeper faces.
  const potential = normalWorldGeometry.y.smoothstep(0.42, 0.88)
    .mul(settings.moss)
    .mul(look ? moss : float(1));
  // Wide soft transition so moss feathers gradually into stone instead of cutting out a hard cap.
  const mossMask = mossGrowth({ field: patchField, potential, sparse: 0.84, dense: 0.46, edge: 0.17 });

  // Gentle damp rim around moss edges grounds colonization onto bare stone without a dark outline.
  const dampBand = patchField.smoothstep(0.38, 0.62)
    .mul(mossMask.oneMinus())
    .mul(up.smoothstep(0.30, 0.80))
    .mul(settings.moss)
    .mul(look ? moss : float(1));
  const dampStone = biomeAlbedo.mul(mix(float(1), float(0.88), dampBand));

  const shade = rockLuma.mul(0.55).add(0.52);
  const palette = surfaceCoatings().moss.palette;
  const mossBase = mix(color(palette.deep), color(palette.dark), clumpTone);
  const mossVelvet = mix(mossBase, color(palette.light), tuftGrain.smoothstep(0.35, 0.88));
  const mossColor = mossVelvet.mul(shade);
  // Two-stage blend: a faint lichen/moss stain lets stone grain read through at the
  // fringes, while the fuller velvety coat builds gradually in damp patch cores.
  const mossStain = mossMask.smoothstep(0.0, 0.55).mul(0.24);
  const stainedStone = mix(dampStone, mossColor, mossStain);
  const mossCoatMask = mossMask.pow(1.5).mul(mix(float(0.48), float(0.76), potential.clamp(0, 1)));
  // Keep a modest contact cue; Lambert lighting and scene AO supply the shade.
  const underside = mix(float(1 - settings.undersideShade), float(1), up.smoothstep(-0.7, 0.15));
  const coatSettings = surfaceCoatings();
  const stoneRoughness = material.roughnessMap
    ? authoredTexture(material.roughnessMap).g.mul(material.roughness ?? 1)
    : float(material.roughness ?? 0.85);
  const stoneNormal = material.normalNode ?? materialNormal;
  // Close-range fractured stone crevice, normal & roughness relief for non-snow painted
  // boulders and 8.5x rock formations (3 sampler-free taps, skipped beyond 55 m and on snow stone).
  const nearFractureFade = smoothstep(18, 55, positionView.z.negate()).oneMinus().toVar();
  const dryRockWeight = look ? snowGround.smoothstep(0.28, 0.85).oneMinus() : float(1);
  const dryFracture = rockFractureDetail({
    point: metricPattern,
    normal: normalWorld,
    baseNormal: stoneNormal,
    strength: nearFractureFade.mul(dryRockWeight).mul(mossCoatMask.oneMinus()).mul(0.88),
    gate: nearFractureFade.mul(dryRockWeight).greaterThan(0.02),
  });
  const detailedStoneColor = stainedStone.mul(dryFracture.albedoFactor);
  const detailedStoneNormal = dryFracture.normal;
  const detailedStoneRoughness = stoneRoughness.add(dryFracture.roughnessDelta).clamp(0.42, 0.98);
  // The micro layer's pits are the cushions, its grit the tufts inside them.
  const mossLayer = mossCoat({ color: mossColor, pillow: edgeBreakup, tuft: tuftGrain, settings: coatSettings });
  const mossed = blendCoat({ color: detailedStoneColor, roughness: detailedStoneRoughness, normal: detailedStoneNormal }, {
    color: mossLayer.color,
    roughness: mossLayer.roughness ?? detailedStoneRoughness.max(0.96),
    normal: mossLayer.normal(detailedStoneNormal),
  }, mossCoatMask);
  publishCoatCoverage(material, { moss: mossCoatMask });
  let weathered = mossed.color.mul(underside);
  let roughness = mossed.roughness;
  let normal = mossed.normal;

  // Dust settles on the bare tops the moss has not claimed.
  const dust = up.smoothstep(0.55, 0.95)
    .mul(mossCoatMask.oneMinus())
    .mul(macroPatch.oneMinus())
    .mul(settings.dust);
  weathered = mix(weathered, color(DUST).mul(shade), dust);

  // Generic WSC contact material blending (PR 4): tracks sloped terrain height,
  // resolved linear terrain albedo, roughness, slope normal, and orthogonal contact AO.
  const groundContact = (ground || look) ? sampleWorldSurfaceContextVarying(world.xz, 'rock') : null;
  const objectLevel = ground
    ? varying(positionGeometry.y.sub(ground.groundY).div(Math.max(1e-3, ground.height)))
    : null;
  // Normalize ground-relative snow drifts in real metres (bounded so 10 m formations
  // grow natural knee-to-waist drifts instead of flat stripes or wall-high collars).
  const driftHeightScale = Math.min(2.6, Math.max(1.35, ground?.height ?? 1.4));
  const groundLevel = (ground && groundContact)
    ? mix(
      objectLevel,
      world.y.sub(groundContact.height).div(driftHeightScale),
      groundContact.validity,
    )
    : objectLevel;
  // Every grounded rock meets the ground through the contact, even without a soil collar
  // (`soil` 0): the band also lights its foot as the ground (`groundLight`).
  if (ground && groundContact) {
    const soilNoise = stylizedFbm2(metricPattern.xz.mul(SOIL_EDGE_PER_METRE)).sub(0.5);
    const fallbackEarth = color(settings.soilColor).mul(look ? look.rgb : vec3(1));
    // Heavy snow country grounds boulders through snowbanks & cool contact AO instead of soil mud.
    const soilMask = look
      ? float(settings.soil).mul(snowGround.smoothstep(0.35, 0.85).oneMinus())
      : float(settings.soil);
    const contact = applyWorldSurfaceContact({
      surface: { color: weathered, roughness, normal },
      wsc: groundContact,
      profile: 'rock',
      worldY: world.y,
      fallbackHeight: positionGeometry.y.sub(ground.groundY),
      fallbackAlbedo: fallbackEarth,
      noiseOffset: soilNoise,
      mask: soilMask,
      aoMask: float(settings.soil),
    });
    publishGroundContact(material, contact);
    weathered = contact.color;
    roughness = contact.roughness;
    normal = contact.normal;
  }

  // Wet, dark and glossy up to a ragged local splash line, with the green
  // that grows just above it. The donor darkens the band; the tint is the half of
  // a waterline that makes it read as a tide mark rather than as shadow.
  let baselineWet = float(0);
  if ((localWater || Number.isFinite(seaLevel)) && settings.waterline > 0) {
    const contact = localWater ? attribute('instanceSurface', 'vec3') : null;
    const level = contact ? contact.x : frameUniform(seaLevel);
    const eligible = contact ? contact.y : float(1);
    const splash = stylizedFbm2(metricPattern.xz.mul(0.7)).mul(0.5).add(0.5)
      .mul(settings.waterlineHeight).mul(contact ? contact.z.mul(0.5).add(1) : float(1));
    const above = world.y.sub(level);
    const wet = above.smoothstep(splash.mul(0.6), splash.add(0.15)).oneMinus()
      .mul(eligible)
      .mul(settings.waterline);
    baselineWet = wet;
    weathered = weathered.mul(wet.mul(settings.wetDarkening).oneMinus());
    roughness = mix(roughness, float(0.25), wet);
    // Algae sits in the upper, drier half of the band — it needs the water but
    // does not live under it — so it fades in above the wet line rather than with
    // it, and is broken up by the same noise the splash line is.
    if (settings.algae > 0) {
      const band = above.smoothstep(splash.mul(0.35), splash.mul(1.1));
      const growth = band.mul(above.smoothstep(-0.2, 0.7)).oneMinus()
        .mul(splash)
        .mul(settings.algae);
      weathered = mix(weathered, color(settings.algaeColor ?? ALGAE), growth.mul(eligible).clamp(0, 1));
    }
  }

  if (impactSettings && localWater) {
    const dynamic = sampleCoastalRockImpactState();
    const contact = attribute('instanceSurface', 'vec3');
    const height = world.y.sub(contact.x);
    const wetReach = float(impactSettings.normalWetReachMeters).add(
      dynamic.runoff.mul(impactSettings.strongWetReachMeters - impactSettings.normalWetReachMeters),
    );
    const vertical = height.smoothstep(wetReach.mul(0.45), wetReach.add(0.15)).oneMinus();
    const damp = dynamic.wetness.mul(vertical).mul(contact.y).clamp(0, 1);
    const additionalWet = damp.mul(baselineWet.oneMinus());
    weathered = weathered.mul(additionalWet.mul(impactSettings.darkeningStrength).oneMinus());
    roughness = mix(roughness, float(impactSettings.freshRoughness), additionalWet.mul(0.8));
  }

  // Snow country: fractured alpine cold stone with basalt normal/roughness relief,
  // frost rime in horizontal strata cracks, crevice-filling height-blended snow,
  // snow-to-rock cool bounce lighting, and cool base contact occlusion.
  if (look) {
    const frost = snowGround.smoothstep(0.28, 0.85).mul(FROST_STONE).toVar();
    const cold = coldStoneSurface({
      point: metricPattern,
      normal: normalWorld,
      baseNormal: normal,
      detailFade: coatDetailFade(coatSettings.detail),
      rimeAmount: snowGround.smoothstep(0.25, 0.85).mul(0.52),
      gate: frost.greaterThan(0.01),
    });
    // Modulate gently by macro plane orientation rather than GLB atlas smudges so
    // crisp fractured basalt strata and subtle mineral variation stay clean.
    const macroPlaneShade = mix(float(0.86), float(1.10), tone.mul(0.5).add(up.mul(0.25).add(0.25)));
    // Cool ambient bounce from surrounding bright snowfield onto lower / side rock faces.
    const rockFootHeight = groundContact
      ? world.y.sub(groundContact.height).clamp(0, 2.6)
      : float(1.2);
    const snowBounce = vec3(0.76, 0.86, 1.0)
      .mul(snowGround.smoothstep(0.35, 0.9))
      .mul(up.smoothstep(0.65, -0.35))
      .mul(rockFootHeight.smoothstep(2.4, 0.15))
      .mul(0.045);
    // Crisp cool rock-to-snow base contact AO so the stone roots firmly into the snowbank.
    const snowBaseAo = groundContact
      ? float(1).sub(
        rockFootHeight.smoothstep(0.0, 0.58).oneMinus()
          .mul(groundContact.contact.mul(0.26).add(0.18))
          .mul(groundContact.validity),
      ).clamp(0.54, 1)
      : float(1);
    const snowBaseTint = mix(vec3(0.76, 0.84, 0.96), vec3(1, 1, 1), snowBaseAo);
    const coldLit = cold.color.mul(macroPlaneShade).mul(snowBaseTint).mul(snowBaseAo).add(snowBounce);
    weathered = mix(weathered, coldLit, frost);
    roughness = mix(roughness, cold.roughness, frost);
    normal = normalize(mix(normal, cold.normal, frost));

    // Wind-streaked 3D world-metre breakup tears snow caps and drift aprons organically
    // across both small boulders and 10 m formations without stretching into blobs or pits.
    const wind = vec3(PREVAILING_WIND[0], 0, PREVAILING_WIND[1]).normalize();
    const along = dot(metricPattern, wind);
    const across = metricPattern.x.mul(wind.z.negate()).add(metricPattern.z.mul(wind.x));
    const stretched = vec3(along.mul(0.26), metricPattern.y.mul(0.88), across.mul(0.65));
    const tear = mx_noise_float(stretched).mul(0.55)
      .add(mx_noise_float(metricPattern.mul(1.95)).mul(0.30))
      .add(mx_noise_float(metricPattern.mul(4.2)).mul(0.15));
    const ledgeBoost = cold.perturbedUp.sub(normalWorld.y).max(0).mul(0.58).mul(frost);
    const { cover, skirt, cap, apron, thickness } = snowDeposition({
      // A storm's snow settles on any stone; the cold stone stays the biome's.
      snow: snowGround.max(stormSnowCoverAt(positionWorld.xz)),
      breakup: tear,
      ledgeBoost,
      crevice: cold.crevice.mul(frost),
      surfaceHeight: mix(float(0.5), cold.height, frost),
      ...(ground ?? {}),
      levelNode: groundLevel,
    });

    // Soften rock facets under snow caps toward sky-up (stronger on thicker caps for a
    // pillowed volumetric read), and align basal snow apron normals to the WSC terrain slope.
    const upView = normalize(cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz);
    const capSmoothNormal = normalize(mix(
      normalView,
      upView,
      cap.mul(smoothstep(0.30, 0.85, up)).mul(mix(float(0.45), float(0.72), thickness)),
    ));
    const groundViewNormal = groundContact
      ? normalize(cameraViewMatrix.mul(vec4(groundContact.normal, 0)).xyz)
      : upView;
    const apronAlign = groundContact
      ? apron.mul(groundContact.validity).mul(0.86).clamp(0, 0.90)
      : float(0);
    const snowBaseNormal = normalize(mix(capSmoothNormal, groundViewNormal, apronAlign));

    // World-metre coordinates keep Snow007C grain consistent across boulder and formation scales.
    const snowLayer = snowCoat(metricPattern, normalWorld, cover, coatSettings);
    const view = normalize(cameraPosition.sub(world));
    const velvet = float(1).sub(dot(normalize(normalWorld), view).clamp(0, 1)).pow(2.4).mul(0.12);
    const snowFacing = mix(up, float(1), apronAlign.mul(0.8));
    const shadeFill = mix(snowLightUniforms.shadeTint, vec3(1, 1, 1), smoothstep(0.28, 0.86, snowFacing));
    // Cool blue-tinted contact shadow right in the snow-to-rock seam pocket.
    const snowSeamAo = mix(vec3(0.82, 0.89, 0.98), vec3(1, 1, 1), snowBaseAo.smoothstep(0.55, 0.96));
    const skirtBaseColor = groundContact
      ? mix(color(SNOW_GROUND_COLOR), groundContact.albedo.max(vec3(0.45)), groundContact.validity.mul(0.55))
      : color(SNOW_GROUND_COLOR);
    const snowColor = mix(color(ROCK_SNOW), skirtBaseColor, skirt)
      .mul(shadeFill)
      .mul(snowSeamAo)
      .mul(snowLightUniforms.brightness.max(0.84))
      .mul(snowLayer?.tint ?? vec3(1))
      .add(vec3(0.85, 0.92, 1.0).mul(velvet).mul(apron.oneMinus()));
    const snowRoughness = coatSettings.snow.enabled ? coatSettings.snow.roughness : PLAIN_SNOW_ROUGHNESS;
    const snowNormal = snowLayer?.normal(snowBaseNormal) ?? snowBaseNormal;
    // Over the moss, not in place of it: the mat beneath stays where it grew.
    const snowed = blendCoat({ color: weathered, roughness, normal }, {
      color: snowColor,
      roughness: float(snowRoughness).add(snowLayer?.roughness ?? 0),
      normal: snowNormal,
    }, cover);
    weathered = snowed.color;
    roughness = snowed.roughness;
    normal = snowed.normal;
    publishCoatCoverage(material, { snow: cover });
  }

  material.colorNode = weathered;
  material.roughnessNode = roughness;
  if (normal !== stoneNormal) material.normalNode = normal;
  material.needsUpdate = true;
  return material;
}
