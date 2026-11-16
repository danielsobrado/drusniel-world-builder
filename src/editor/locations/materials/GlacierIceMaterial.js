import {
  attribute, cameraPosition, clamp, color, exp, float, length, mix, mx_worley_noise_float, normalize,
  positionWorld, refract, saturation, smoothstep, vec3, vec4,
} from 'three/tsl';
import { iceCover, weatheringCrust } from './ice/IceCover.js';
import { iceGloss } from './ice/IceGloss.js';
import { iceInterior } from './ice/IceInterior.js';
import { iceStrata } from './ice/IceStrata.js';
import {
  bakedLight, bakedShade, bumpNormal, createLocationMaterial, geometryNormal, locationLight, shadeSurface,
  triplanarNormal, triplanarSample, triplanarWeights, viewDirection,
} from './LocationShading.js';
import { NOISE, locationNoise } from './locationNoise.js';
import { stoneSurface } from './StoneSurface.js';

/**
 * Glacier ice.
 *
 * Opaque by design: a refraction pass would copy the whole frame (CLAUDE.md, QA
 * and performance). The depth is instead built from things that are each
 * physically motivated:
 *
 *  - **Scatter.** How much the ice turns light round before it gets deep: clear
 *    meltwater ice hardly at all, bubbly firn ice within centimetres. It comes
 *    from the glacier's layering at three scales (`ice/IceStrata.js`: lenses
 *    tens of metres long, bands a metre or two thick, thin firn layers), its
 *    bubbles and the weathered crust of faces open to the sky.
 *  - **Absorption and path.** Ice takes red out of light within a metre and
 *    passes blue for tens of metres. Aerated ice returns light from a short
 *    path, pale grey-aqua; clear ice is looked into, and little of the light that
 *    goes deep comes back, so thick clear ice is dark slate. How deep the view
 *    reaches depends on the metres of solid behind the surface (`bakeShade.y`,
 *    which saturates on most walls), the view angle (a glancing view skims the
 *    surface) and the crevices (a recess is a longer path).
 *  - **Light already through the ice.** The bake runs every light through the
 *    ice volume (`gen/LightBake.js`), so a wall lit from behind arrives short of
 *    red. That light is seen by its own colour, not through the body colour a
 *    second time.
 *  - **Surface reflection.** `ice/IceGloss.js`: Schlick's Fresnel on the
 *    scalloped normal mirrors the sky at grazing angles, and the light it turns
 *    back never enters the body.
 *  - **Interior structure.** `ice/IceInterior.js`: cracks, bubbles and a few
 *    bold fracture faces on the refracted view ray, absorbed and veiled by the
 *    ice in front of them.
 *
 * One shader serves every family: a profile (`iceProfiles` in
 * `config/instanced-locations.yaml`) sets the base amounts, and the vertex masks
 * push a region of a wall toward another family.
 *
 *   surfMask   x rock   y snow (negative where wind scours it off)   z frost   w fracture
 *   surfMask2  x sediment   y bubbles   z polish (melt-smoothed, wet)   w trail (snow packed by feet and runners)
 */

const ICE_IOR = 1.31;
/** Reflectance of ice seen square-on, ((n − 1) / (n + 1))². */
const ICE_F0 = ((ICE_IOR - 1) / (ICE_IOR + 1)) ** 2;
/** How far behind the surface the strata are read, metres. */
const STRATA_DEPTH = 0.5;
/** Light path through ice that has no thickness to speak of, metres. */
const MIN_PATH = 0.35;
/** Share of the ice's depth a glancing view still reaches: it skims the surface and sees mostly near ice. */
const GRAZE_DEPTH = 0.15;
/** Metres of clear ice over which the view goes dark: deep clear ice has nothing to send light back. */
const DARK_DEPTH = 2;
/** How much longer light's path is in a crevice than on an open face: recesses go deeper. */
const CREVICE_DEPTH = 1.5;
/** How much each bubble adds to the ice's scatter. */
const BUBBLE_SCATTER = 0.4;
/** Red deficit of baked light after ~1.2 m and ~4 m of ice: from there on it came through the ice. */
const THROUGH_FROM = 0.4, THROUGH_TO = 0.85;
/** Baked light this dim says nothing about its colour. */
const DIM_LIGHT = 0.05;
/** Dirt layers every glacier carries even where it looks clean. */
const ASH_TRACE = 0.1;
/** Per-metre rate at which ice stops glowing with the light behind it. */
const THIN_FALLOFF = 1.4;
/** Fine micro-relief repeats per metre, and its strength beside the coarse sample. */
const MICRO_FINE = 1.3, MICRO_FINE_SHARE = 0.6;

/**
 * @param {string} name
 * @param {object} options
 * @param {object} options.profile resolved `iceProfiles` entry
 * @param {{ ice: object, cracks: object, snow: object, rock?: object }} options.maps texture sets
 * @param {object} [options.stoneProfile] bedrock / moraine layer blended in by `surfMask.x`
 * @param {number} [options.layers] interior samples along the view ray (quality)
 * @param {boolean} [options.masked] whether the mesh carries the vertex masks
 */
export function createGlacierIceMaterial(name, { profile, maps, stoneProfile = null, layers = 3, masked = true }) {
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

  // Melt scallops: cups with sharp rims, the relief moving air and meltwater leave on ice. Floors stay flat underfoot.
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
  const strata = iceStrata(deepPoint, profile.banding, near);
  const crust = weatheringCrust({ profile, occlusion, sky, hollow, firn: strata.firn });
  const scatter = clamp(strata.milk.add(profile.cloud).add(bubbles.mul(BUBBLE_SCATTER)).add(crust), 0, 1);

  const gloss = iceGloss({ normal, f0: ICE_F0, open: sky, reflection: profile.reflection });
  const reach = thickness.mul(profile.depthRate).mul(mix(float(GRAZE_DEPTH), float(1), gloss.facing))
    .mul(occlusion.oneMinus().mul(CREVICE_DEPTH).add(1));
  const transmit = exp(absorption.mul(reach.mul(scatter.oneMinus()).add(MIN_PATH)).negate());
  const deep = scatter.oneMinus().mul(exp(reach.div(-DARK_DEPTH)).oneMinus());
  let albedo = saturation(mix(color(profile.thinColor).mul(transmit), color(profile.deepColor), deep), profile.saturation)
    .mul(gloss.fresnel.oneMinus());
  // Light that reached the surface through the ice is already its own blue: the face glows with it.
  const redDeficit = clamp(bakedLight.g.sub(bakedLight.r).div(bakedLight.g.add(DIM_LIGHT)), 0, 1);
  albedo = mix(albedo, color(profile.thinColor), smoothstep(THROUGH_FROM, THROUGH_TO, redDeficit).mul(profile.lightThrough));

  // Grit rides in the dirt layers, fine enough to read as silt and not as spots.
  const grit = smoothstep(0.3, 0.55, locationNoise(NOISE.grit, deepPoint.mul(23))).mul(strata.ash.mul(0.7).add(0.3)).mul(near);
  const dirt = clamp(strata.ash.mul(sediment.mul(1.6).add(ASH_TRACE)).add(grit.mul(sediment).mul(0.32)), 0, 1);
  albedo = mix(albedo, color(profile.sedimentColor), dirt);
  const interior = iceInterior({
    point, into, weights, cracks: maps.cracks, absorption, layers, crackGain: profile.crackGain, fracture, bubbles,
    scatter, near,
  });
  albedo = albedo.add(color(profile.scatterColor).mul(interior));

  // Rough at three scales: the photographed grain (its full strength draws a crack web in every highlight),
  // metre-scale patches, and whole stretches of aerated ice and scallop rims against glassy clear ice.
  let roughness = float(profile.roughness).mul(triplanarSample(maps.ice.rough, point, weights, 0.11).g.mul(0.3).add(0.85))
    .add(locationNoise(NOISE.patch, point.mul(0.4)).mul(0.08)).add(scatter.mul(0.18)).add(hollow.oneMinus().mul(0.08)).add(dirt.mul(0.3));
  roughness = mix(roughness, float(0.05), polish);
  let f0 = float(ICE_F0);
  let wrap = float(0.9);
  let bare = float(1);

  if (stoneProfile && maps.rock) {
    const rock = stoneSurface(stoneProfile, maps.rock, null);
    const share = smoothstep(0.42, 0.58, mask.x.add(locationNoise(NOISE.patch, point.mul(0.6)).mul(0.14)));
    albedo = mix(albedo, rock.albedo, share);
    normal = normalize(mix(normal, rock.normal, share));
    roughness = mix(roughness, rock.roughness, share);
    f0 = mix(f0, rock.f0, share);
    wrap = mix(wrap, float(0.15), share);
    bare = share.oneMinus();
  }

  const covered = iceCover({ albedo, normal, roughness, wrap, bare }, {
    point, profile, snowMaps: maps.snow, frost: amount(mask.z, profile.frost),
    // Snow drifts where a generator put it, and falls wherever the sky can see.
    snow: amount(mask.y.add(sky.mul(profile.snowfall)), profile.snow), trail: mask2.w, occlusion, sky, near, hollow,
  });
  // The sky in the ice: blurred away by roughness, hidden in crevices, and only where the ice is bare.
  const smooth = covered.roughness.oneMinus().clamp(0, 1);
  const mirrored = gloss.mirrored.mul(smooth.mul(smooth)).mul(occlusion.mul(occlusion)).mul(covered.bare);
  // Thin ice is lit from all round: an icicle or a fin glows against the wall behind it.
  const through = covered.albedo.mul(locationLight.ambientUp.add(locationLight.ambientDown))
    .mul(exp(thickness.mul(-THIN_FALLOFF))).mul(covered.bare).mul(profile.translucency);
  return createLocationMaterial(name, shadeSurface({
    albedo: covered.albedo, normal: covered.normal, roughness: clamp(covered.roughness, 0.04, 1), f0,
    wrap: covered.wrap, sheen: covered.bare.mul(profile.gloss), emissive: through.add(mirrored),
  }));
}
