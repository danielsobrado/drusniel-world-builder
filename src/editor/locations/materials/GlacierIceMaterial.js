import {
  attribute, cameraPosition, clamp, color, exp, float, length, mix, mx_worley_noise_float, normalize,
  positionWorld, refract, saturation, smoothstep, vec3, vec4,
} from 'three/tsl';
import { REFLECTION_CLASSES, assignMaterialData } from '../../../render/postprocessing/PostProcessingMaterialData.js';
import { iceCaustics } from './ice/IceCaustics.js';
import { iceCover, weatheringCrust } from './ice/IceCover.js';
import { iceGloss } from './ice/IceGloss.js';
import { iceInterior } from './ice/IceInterior.js';
import { shadeIceSurface } from './ice/IceLighting.js';
import { iceSparkle } from './ice/IceSparkle.js';
import { iceStrata } from './ice/IceStrata.js';
import { ICE_F0, ICE_IOR } from './ice/IceBrdf.js';
import {
  bakedDirection, bakedLight, bakedShade, bumpNormal, createLocationMaterial, geometryNormal, locationLight,
  triplanarNormal, triplanarSample, triplanarWeights, viewDirection,
} from './LocationShading.js';
import { NOISE, locationNoise } from './locationNoise.js';
import { stoneSurface } from './StoneSurface.js';

/**
 * Glacier ice (opaque cavern walls, pillars, crevasse cliffs, frozen floor & blocks).
 *
 * Upgraded with physically-based Cook-Torrance GGX + wet meltwater clearcoat,
 * 2-depth parallax glacial foliation, multi-layer refracted cracks & critical-angle
 * fracture planes, animated refracted Voronoi caustics, anti-aliased crystalline
 * micro-facet sparkle, dual-lobe backlit subsurface scattering, and per-pixel MRT
 * outputs for location-scoped GTAO, Selective Ice-Floor SSR, and HDR Bloom.
 *
 *   surfMask   x rock   y snow (negative where wind scours it off)   z frost   w fracture
 *   surfMask2  x sediment   y bubbles   z polish (melt-smoothed, wet)   w trail (snow packed by feet and runners)
 */

const STRATA_DEPTH = 0.45;
const MIN_PATH = 0.35;
const GRAZE_DEPTH = 0.15;
const DARK_DEPTH = 2.0;
const CREVICE_DEPTH = 1.5;
const BUBBLE_SCATTER = 0.4;
const THROUGH_FROM = 0.4, THROUGH_TO = 0.85;
const DIM_LIGHT = 0.05;
const ASH_TRACE = 0.1;
const THIN_FALLOFF = 1.35;
const MICRO_FINE = 1.3, MICRO_FINE_SHARE = 0.65;

/**
 * @param {string} name
 * @param {object} options
 * @param {object} options.profile resolved `iceProfiles` entry
 * @param {{ ice: object, cracks: object, snow: object, rock?: object, crystalPack?: Texture }} options.maps texture sets
 * @param {object} [options.stoneProfile] bedrock / moraine layer blended in by `surfMask.x`
 * @param {number} [options.layers] interior samples along the view ray (quality)
 * @param {boolean} [options.masked] whether the mesh carries the vertex masks
 * @param {boolean} [options.usePostMrt] attach per-pixel MRT outputs for location post-processing
 */
export function createGlacierIceMaterial(name, {
  profile,
  maps,
  stoneProfile = null,
  layers = 3,
  masked = true,
}) {
  const point = positionWorld;
  const mask = masked ? attribute('surfMask', 'vec4') : vec4(0);
  const mask2 = masked ? attribute('surfMask2', 'vec4') : vec4(0);
  const amount = (channel, base) => clamp(channel.add(base), 0, 1);
  const fracture = amount(mask.w, profile.fracture), sediment = amount(mask2.x, profile.sediment);
  const bubbles = amount(mask2.y, profile.bubbles), polish = amount(mask2.z, profile.polish);
  const occlusion = bakedShade.x, thickness = bakedShade.y, sky = bakedShade.z;
  const [detailNear, detailFar] = profile.detailRange;
  const near = smoothstep(detailFar, detailNear, length(cameraPosition.sub(point)));
  const weights = triplanarWeights(geometryNormal);
  const packMap = maps.crystalPack ?? null;

  // Melt scallops: cups with sharp rims left by moving air & meltwater. Floors stay flat underfoot.
  const cell = mx_worley_noise_float(point.mul(profile.scallop.scale));
  const cup = cell.mul(cell);
  const hollow = smoothstep(0.3, 0.05, cup);
  const walls = smoothstep(0.9, 0.55, geometryNormal.y);
  const cupped = bumpNormal(geometryNormal, cup.mul(profile.scallop.depth).mul(walls), 1);
  const micro = polish.oneMinus().mul(profile.microNormal);
  const coarse = triplanarNormal(maps.ice.normal, point, cupped, weights, 0.21, micro);
  let normal = triplanarNormal(maps.ice.normal, point, coarse, weights, MICRO_FINE, micro.mul(near).mul(MICRO_FINE_SHARE));

  const into = refract(viewDirection.negate(), normal, 1 / ICE_IOR);
  const absorption = vec3(...profile.absorption);
  const deepPoint = point.add(into.mul(STRATA_DEPTH));
  const strata = iceStrata(deepPoint, profile.banding, near, into);
  const crust = weatheringCrust({ profile, occlusion, sky, hollow, firn: strata.firn });
  const scatter = clamp(strata.milk.add(profile.cloud).add(bubbles.mul(BUBBLE_SCATTER)).add(crust), 0, 1);

  const gloss = iceGloss({ normal, f0: ICE_F0, open: sky, reflection: profile.reflection, bakedLight });
  const reach = thickness.mul(profile.depthRate).mul(mix(float(GRAZE_DEPTH), float(1), gloss.facing))
    .mul(occlusion.oneMinus().mul(CREVICE_DEPTH).add(1));
  const transmit = exp(absorption.mul(reach.mul(scatter.oneMinus()).add(MIN_PATH)).negate());
  const deep = scatter.oneMinus().mul(exp(reach.div(-DARK_DEPTH)).oneMinus());
  let albedo = saturation(mix(color(profile.thinColor).mul(transmit), color(profile.deepColor), deep), profile.saturation)
    .mul(gloss.fresnel.oneMinus());

  // Light that reached the surface through the ice is already its own cyan-blue: the face glows with it.
  const redDeficit = clamp(bakedLight.g.sub(bakedLight.r).div(bakedLight.g.add(DIM_LIGHT)), 0, 1);
  albedo = mix(albedo, color(profile.thinColor), smoothstep(THROUGH_FROM, THROUGH_TO, redDeficit).mul(profile.lightThrough));

  // Grit rides in the dirt layers, fine enough to read as silt and not as spots.
  const grit = smoothstep(0.3, 0.55, locationNoise(NOISE.grit, deepPoint.mul(23))).mul(strata.ash.mul(0.7).add(0.3)).mul(near);
  const dirt = clamp(strata.ash.mul(sediment.mul(1.6).add(ASH_TRACE)).add(grit.mul(sediment).mul(0.32)), 0, 1);
  albedo = mix(albedo, color(profile.sedimentColor), dirt);

  const interior = iceInterior({
    point, into, weights, cracks: maps.cracks, packMap, absorption, layers,
    crackGain: profile.crackGain, fracture, bubbles, scatter, near,
  });
  albedo = albedo.add(color(profile.scatterColor).mul(interior));

  let roughness = float(profile.roughness).mul(triplanarSample(maps.ice.rough, point, weights, 0.11).g.mul(0.3).add(0.85))
    .add(locationNoise(NOISE.patch, point.mul(0.4)).mul(0.08)).add(scatter.mul(0.18))
    .add(hollow.oneMinus().mul(0.08)).add(dirt.mul(0.3));
  roughness = mix(roughness, float(0.05), polish);
  let f0 = float(ICE_F0);
  let wrap = float(0.9);
  let bare = float(1);

  if (stoneProfile && maps.rock) {
    const rock = stoneSurface(stoneProfile, maps.rock, null);
    // Wider, frost-feathered bedrock transition eliminates the harsh dark contour bands seen at ice/rock borders.
    const rockField = mask.x.add(locationNoise(NOISE.patch, point.mul(0.45)).mul(0.18));
    const share = smoothstep(0.30, 0.72, rockField);
    const frostRim = smoothstep(0.18, 0.48, rockField).mul(smoothstep(0.44, 0.76, rockField).oneMinus()).mul(0.35);
    albedo = mix(albedo, rock.albedo, share);
    albedo = mix(albedo, color(profile.frostColor).mul(0.85), frostRim);
    normal = normalize(mix(normal, rock.normal, share));
    roughness = mix(roughness, rock.roughness, share);
    f0 = mix(f0, rock.f0, share);
    wrap = mix(wrap, float(0.18), share);
    bare = share.oneMinus();
  }

  const lightDir = normalize(bakedDirection.add(vec3(0, 0.35, 0)));
  const covered = iceCover({ albedo, normal, roughness, wrap, bare }, {
    point, profile, snowMaps: maps.snow, packMap, lightDir,
    frost: amount(mask.z, profile.frost),
    snow: amount(mask.y.add(sky.mul(profile.snowfall)), profile.snow),
    trail: mask2.w, occlusion, sky, near, hollow,
  });

  const finalRoughness = clamp(covered.roughness, 0.045, 1);
  const smooth = finalRoughness.oneMinus().clamp(0, 1);
  const mirrored = gloss.mirrored.mul(smooth.mul(smooth)).mul(occlusion.mul(occlusion)).mul(covered.bare);

  // Thin ice backlit glow + animated refracted glacial caustics + crystalline edge glints.
  const through = covered.albedo.mul(locationLight.ambientUp.add(locationLight.ambientDown))
    .mul(exp(thickness.mul(-THIN_FALLOFF))).mul(covered.bare).mul(profile.translucency);
  const caustics = iceCaustics({
    point, normal: covered.normal, packMap, bakedLight, bakedDirection, occlusion,
    bare: covered.bare, near, strength: profile.caustics ?? 0.38,
  });
  const crystalGlint = iceSparkle({
    point, normal: covered.normal, packMap, lightDir, near,
    scale: 12.5, threshold: 0.79, strength: 0.72,
  }).mul(covered.bare).mul(smooth.mul(0.6).add(0.4));
  const glintEmissive = vec3(0.82, 0.95, 1.0).mul(crystalGlint.add(covered.glint.mul(0.28)));

  const clearcoat = clamp(polish.mul(0.65).add(float(profile.gloss ?? 0.3).mul(1.35)), 0, 1);
  const sssStrength = float(profile.translucency ?? 1.0).mul(0.26);
  const iridPhase = locationNoise(NOISE.mottle, point.mul(0.75)).mul(0.5).add(0.5);

  const shaded = shadeIceSurface({
    albedo: covered.albedo,
    normal: covered.normal,
    roughness: finalRoughness,
    f0,
    wrap: covered.wrap,
    clearcoat,
    coatRoughness: 0.05,
    thickness,
    scatter,
    absorption,
    sssStrength,
    iridescence: float(0.14).mul(smooth),
    iridescencePhase: iridPhase,
    emissive: through.add(mirrored).add(caustics).add(glintEmissive),
    bare: covered.bare,
  });

  const material = createLocationMaterial(name, shaded);
  assignMaterialData(material, {
    roughness: profile.roughness ?? 0.14,
    reactive: 0.08,
    reflectionClass: REFLECTION_CLASSES.ICE,
    bloomBoost: 0.10,
  });
  return material;
}
