import {
  attribute,
  color,
  dot,
  float,
  fract,
  materialColor,
  materialNormal,
  materialRoughness,
  mix,
  normalGeometry,
  normalWorld,
  normalWorldGeometry,
  positionGeometry,
  positionWorld,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';
import { stylizedFbm2 } from './StylizedNoiseNodes.js';
import { surfaceWetnessUniform } from '../weather/surfaceWetness.js';
import { worldNoiseField } from './worldNoise.js';
import { WORLD_NOISE_LAYERS } from './worldNoiseLayout.js';
import { blendCoat } from '../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { mossCoat } from './surfaceCoatings/MossCoat.js';
import { snowCoat } from './surfaceCoatings/SnowCoat.js';
import { surfaceCoatings } from './surfaceCoatings/SurfaceCoatingConfig.js';
import { publishCoatCoverage } from './surfaceCoatings/CoatCoverage.js';

/** Trunk snow's roughness when the snow coat is off. */
const TRUNK_SNOW_ROUGHNESS = 0.78;
import { sampleWorldSurfaceContextVarying } from './worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact } from './worldSurfaceContext/WorldSurfaceContactNodes.js';

/**
 * Bark weathering — after grass-test's `barkWeathering`.
 *
 * Moss on the shaded side and on upward faces in broken patches, rain running
 * down the trunk in dark streaks, snow caught on the branch tops up in snow
 * country, an earthy base where soil splashes up, and a per-tree colour drift so
 * neighbouring copies of one model differ.
 *
 * Three adaptations, each of which this project earns rather than loses:
 *
 * - *Height above the ground comes from the prototype*, `positionGeometry.y`, not
 *   from a terrain heightfield texture. A tree prototype's origin is its trunk
 *   base, so that is the height up the trunk directly, and it costs no texture
 *   fetch. It scales with the instance, so a bigger tree simply has a taller moss
 *   band, which is what a bigger tree has.
 * - *Rain is the shared wetness accumulator* — the same 0..1 value the ground
 *   darkens and shines by — rather than a second rain uniform that could disagree
 *   with the ground the tree is standing on.
 * - *The per-tree seed is `instanceDither.y`*, the stable per-instance value the
 *   lod runtime already writes, so no new attribute is needed and a tree keeps its
 *   drift across its LOD levels.
 */

// Moss favours the shaded side of a trunk. North is -Z here, the same convention
// the sun and the terrain shading use.
const SHADED_SIDE = Object.freeze([0, 0, -1]);
/** Metres up the trunk over which the moss thins out. */
const MOSS_REACH = 6;
const WET_DARKENING = 0.45;
const BASE_TINT = Object.freeze([0.62, 0.58, 0.5]);
const DEFAULT_SOIL = '#6e5435';

export const DEFAULT_BARK_WEATHERING = Object.freeze({
  enabled: true,
  moss: 0.7,
  wet: 0.8,
  /** How much snow gathers on the upward faces, 0..1. */
  snow: 0.8,
  tint: 0.12,
  base: 0.35,
  /** Metres up the trunk the earthy base reaches. */
  baseHeight: 1.2,
});

/**
 * @param {object} surface `stylizedSurface`
 * @param {object} [options]
 * @param {object} [options.snow] the world's own snow band — `{ snowLine, snowFade,
 *   snowColor }` — handed down from the composition root, because it lives in the
 *   world configuration and the surface config cannot see it
 * @returns {null|object} settings, with the snow band resolved so bark and ground
 *   whiten at the same altitude
 */
export function resolveBarkWeathering(surface, { snow = null } = {}) {
  const configured = surface?.trees?.weathering;
  if (configured?.enabled === false) return null;
  const settings = { ...DEFAULT_BARK_WEATHERING, ...(configured ?? {}) };
  // Soil is the floor's own litter, so a trunk wears the ground it stands on. Moss
  // is the shared moss pigment (surfaceCoatings.moss.palette), as on stones and logs.
  settings.soilColor = surface?.trees?.forestFloor?.litterColor ?? DEFAULT_SOIL;
  for (const key of ['moss', 'wet', 'snow', 'tint', 'base']) {
    const value = Number(settings[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Invalid editor configuration: trees.weathering.${key} must be within [0, 1].`);
    }
  }
  if (!(Number(settings.baseHeight) > 0)) {
    throw new Error('Invalid editor configuration: trees.weathering.baseHeight must be positive.');
  }
  // Snow on a trunk has to start where snow on the ground does, or a hillside comes
  // out with white ground and bare trunks. The band is the terrain's own; a config
  // may override it, and with no band at all the snow term is switched off rather
  // than invented.
  const source = { ...(snow ?? surface?.farTerrain ?? {}) };
  const line = Number(settings.snowLine ?? source.snowLine);
  const fade = Number(settings.snowFade ?? source.snowFade);
  const snowColor = settings.snowColor
    ?? (typeof source.snowColor === 'string' ? source.snowColor : null);
  const snowBand = Number.isFinite(line) && Number.isFinite(fade) && fade > 0 && snowColor
    ? { line, fade, color: snowColor }
    : null;
  return { ...settings, snowBand };
}

/**
 * Replaces a trunk material's albedo with its weathered one, in place.
 *
 * @param {object} material the trunk material, whose `colorNode` is its bark
 * @param {object} options
 * @param {object} options.settings resolved by `resolveBarkWeathering`
 */
export function applyBarkWeathering(material, { settings }) {
  if (!settings?.enabled) return material;
  const bark = material.colorNode ?? materialColor;
  const local = positionGeometry;
  const seed = attribute('instanceDither', 'vec3').y;
  // Sampled around the trunk rather than across the world, so a patch wraps it
  // instead of sliding as the tree moves.
  const around = local.x.add(local.z);

  // A per-tree drift: some trunks warmer, some cooler, none identical.
  const tint = mix(vec3(1.07, 1.0, 0.9), vec3(0.9, 0.95, 1.04), seed);
  const tinted = mix(bark, bark.mul(tint), float(settings.tint).mul(4));

  const patches = stylizedFbm2(vec2(around.mul(0.9), local.y.mul(0.6)).add(seed.mul(19)))
    .smoothstep(-0.15, 0.35);
  // The shaded side, plus whatever faces up: a trunk keeps moss on its north face
  // and along the tops of its roots, which is where it stays damp.
  const facing = dot(normalWorld, vec3(SHADED_SIDE[0], SHADED_SIDE[1], SHADED_SIDE[2]))
    .max(0).mul(0.7)
    .add(smoothstep(0.55, 0.92, normalWorld.y).mul(0.45));
  const low = smoothstep(0, MOSS_REACH, local.y).oneMinus().mul(0.6).add(0.4);
  // The snow band is an altitude, so it reads the world height — the instance
  // anchor shifts only x and z, so y is canonical metres. Against `local.y`,
  // the height up the trunk, the 700 m line was never reached and trunks
  // stayed bare under snowy crowns.
  const snowLine = settings.snowBand
    ? smoothstep(settings.snowBand.line, settings.snowBand.line + settings.snowBand.fade, positionWorld.y)
    : float(0);
  // Nothing mossy survives above the snow line, which is the same line the ground
  // whitens at.
  // Moss settles into the bark's grooves before it climbs its ridges.
  const groove = (material.treeBarkHeightNode ?? float(0.5)).clamp(0, 1).oneMinus();
  const moss = facing.mul(patches).mul(low).mul(snowLine.oneMinus())
    .mul(settings.moss).mul(groove.mul(0.6).add(0.7)).clamp(0, 1);
  const mossPalette = surfaceCoatings().moss.palette;
  const mossColor = mix(color(mossPalette.dark), color(mossPalette.light), fract(seed.mul(3.1)))
    .mul(dot(bark, vec3(0.3, 0.59, 0.11)).mul(1.2).add(0.6));
  // One world-noise tap around the trunk: its pits are the cushions, its grit the tufts.
  const micro = worldNoiseField(WORLD_NOISE_LAYERS.micro)(vec2(around, local.y).div(0.8).add(seed.mul(5.3)));
  const mossLayer = mossCoat({ color: mossColor, pillow: micro.g, tuft: micro.r });
  const barkRoughness = material.roughnessNode ?? materialRoughness;
  const barkNormal = material.normalNode ?? materialNormal;
  const mossed = blendCoat({ color: tinted, roughness: barkRoughness, normal: barkNormal }, {
    color: mossLayer.color,
    roughness: mossLayer.roughness ?? barkRoughness,
    normal: mossLayer.normal(barkNormal),
  }, moss);
  if (mossed.normal !== barkNormal) {
    material.roughnessNode = mossed.roughness;
    material.normalNode = mossed.normal;
  }
  const mossy = mossed.color;

  // True height above the sloped/sunk ground and generic WSC contact collar
  // (PR 4: replaces abrupt 15 cm trunk cutoff with YAML-profiled PBR coat blend).
  const wsc = sampleWorldSurfaceContextVarying(positionWorld.xz, 'bark');
  const prelimHeight = mix(local.y, positionWorld.y.sub(wsc.height), wsc.validity);
  const baseShade = smoothstep(0, settings.baseHeight, prelimHeight).oneMinus().mul(settings.base);
  const shaded = mix(mossy, mossy.mul(vec3(BASE_TINT[0], BASE_TINT[1], BASE_TINT[2])), baseShade);
  const currentRoughness = material.roughnessNode ?? barkRoughness;
  const currentNormal = material.normalNode ?? barkNormal;
  const contact = applyWorldSurfaceContact({
    surface: { color: shaded, roughness: currentRoughness, normal: currentNormal },
    wsc,
    profile: 'tree',
    fallbackHeight: local.y,
    fallbackAlbedo: color(settings.soilColor),
    noiseOffset: patches.sub(0.5),
  });
  const heightAbove = contact.heightAbove;
  material.treeGroundHeightNode = heightAbove;
  const grounded = contact.color;
  material.roughnessNode = contact.roughness;
  material.normalNode = contact.normal;

  // Rain runs down in streaks, so the bark darkens unevenly rather than as one
  // flat soak.
  const runs = stylizedFbm2(vec2(around.mul(2.4), local.y.mul(0.18)).add(seed.mul(7)))
    .smoothstep(-0.4, 0.4).mul(0.6).add(0.4);
  const wet = surfaceWetnessUniform.mul(settings.wet).mul(runs).mul(contact.coverage.mul(0.7).oneMinus());
  const soaked = grounded.mul(wet.mul(WET_DARKENING).oneMinus());

  if (!settings.snowBand) {
    material.treeWetnessNode = wet;
    material.colorNode = soaked;
    publishCoatCoverage(material, { moss, wet });
    return material;
  }
  // Snow collects on whatever faces up, plus a low ground-drift collar round
  // the roots so trunks sit embedded in deep snow rather than poking out bare.
  const snowFaces = normalWorldGeometry.y.smoothstep(0.3, 0.7).mul(patches.mul(0.5).add(0.5));
  const snowSkirt = smoothstep(0.04, 0.34, heightAbove.add(patches.sub(0.5).mul(0.18))).oneMinus();
  const snow = snowFaces.max(snowSkirt.mul(0.9)).mul(snowLine).mul(settings.snow);
  const cover = snow.clamp(0, 1);
  material.treeWetnessNode = wet.mul(cover.oneMinus());
  // The terrain's Snow007C coat, as on rocks and roofs: grain, roughness and
  // normals, in the trunk's own frame so it does not slide with the floating origin.
  const coatSettings = surfaceCoatings();
  const snowLayer = snowCoat(positionGeometry, normalGeometry, cover, coatSettings);
  const trunkRoughness = material.roughnessNode ?? materialRoughness;
  const trunkNormal = material.normalNode ?? materialNormal;
  const snowed = blendCoat({ color: soaked, roughness: trunkRoughness, normal: trunkNormal }, {
    color: color(settings.snowBand.color).mul(snowLayer?.tint ?? vec3(1)),
    roughness: float(coatSettings.snow.enabled ? coatSettings.snow.roughness : TRUNK_SNOW_ROUGHNESS)
      .add(snowLayer?.roughness ?? 0),
    normal: snowLayer?.normal() ?? undefined,
  }, cover);
  material.colorNode = snowed.color;
  material.roughnessNode = snowed.roughness;
  if (snowed.normal !== trunkNormal) material.normalNode = snowed.normal;
  publishCoatCoverage(material, { moss, snow: cover, wet });
  return material;
}
