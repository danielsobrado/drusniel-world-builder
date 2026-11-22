import * as THREE from 'three/webgpu';
import {
  cameraFar, cameraNear, cameraPosition, cameraViewMatrix, clamp, color, cross, dFdx, dFdy, dot, exp,
  float, length, linearDepth, max, mix, normalize, positionWorld, pow, refract, screenUV, select,
  smoothstep, vec2, vec3, vec4, viewportDepthTexture, viewportOpaqueMipTexture, viewportSafeUV,
} from 'three/tsl';
import { REFLECTION_CLASSES, assignMaterialData } from '../../../render/postprocessing/PostProcessingMaterialData.js';
import { ICE_F0, ICE_IOR, iceIridescence, schlickFresnel } from './ice/IceBrdf.js';
import { iceGloss } from './ice/IceGloss.js';
import { iceInterior } from './ice/IceInterior.js';
import { shadeIceSurface } from './ice/IceLighting.js';
import { iceSparkle } from './ice/IceSparkle.js';
import {
  bakedDirection, bakedLight, bakedShade, geometryNormal, locationLight, triplanarNormal, triplanarWeights,
  viewDirection,
} from './LocationShading.js';
import { NOISE, locationNoise } from './locationNoise.js';

/**
 * Physical refractive glacial ice crystal & clear-ice shader (`clearIce`, `iceCrystal`).
 *
 * Reinvests the grass-free high-mountain GPU budget inside instanced ice locations:
 *  - True screen-space PBR transmission via `viewportOpaqueMipTexture` + `viewportDepthTexture`
 *    with 3-IOR chromatic dispersion (`1.304 / 1.310 / 1.318`), roughness-driven mip blur,
 *    and soft foreground depth rejection so foreground meshes never bleed into refraction.
 *  - Physical Beer-Lambert spectral absorption driven by combined screen-space optical
 *    depth and baked solid thickness (`bakeShade.y`).
 *  - Flat-facet / beveled crystalline normal blending (`dFdx`/`dFdy` with degeneracy guard)
 *    for sharp hexagonal crystal faces + dual-lobe wet clearcoat GGX + thin-film iridescence.
 *  - Multi-layer internal parallax fractures, trapped air bubbles, and critical-angle
 *    mirror sheets sliding behind the facet.
 *  - Warm & cool backlit subsurface glow around lanterns, torches, and the Runic Ice
 *    Lantern Shrine (energy-balanced so thin ice refracts warm ember cores instead of
 *    clipping to opaque white).
 *  - On `low` quality (`transmission: false`), falls back cleanly to an opaque analytic
 *    crystal shader with zero `viewport*Texture` nodes compiled in.
 */

const DISPERSION_R = 1.0 - 0.14;
const DISPERSION_G = 1.0;
const DISPERSION_B = 1.0 + 0.16;

function safeFacetNormal(worldPos, fallbackNormal) {
  const raw = cross(dFdx(worldPos), dFdy(worldPos));
  const area = length(raw);
  const unit = raw.div(max(area, 1e-6));
  // Flip toward camera if backfacing, fall back to vertex normal on degenerate slivers.
  const oriented = select(dot(unit, viewDirection).lessThan(0), unit.negate(), unit);
  return normalize(mix(fallbackNormal, oriented, smoothstep(float(1e-6), float(1e-4), area)));
}

/**
 * @param {string} name
 * @param {object} options
 * @param {object} options.profile resolved `iceProfiles` entry
 * @param {{ ice: object, cracks: object, snow: object, crystalPack?: Texture }} options.maps
 * @param {number} [options.layers] internal parallax layers
 * @param {boolean} [options.transmission] enable screen-space `viewportOpaqueMipTexture` refraction
 * @param {boolean} [options.usePostMrt] attach per-pixel MRT outputs for location post-processing
 */
export function createIceCrystalMaterial(name, {
  profile,
  maps,
  layers = 3,
  transmission = true,
}) {
  const point = positionWorld;
  const packMap = maps.crystalPack ?? null;
  const occlusion = clamp(bakedShade.x, 0, 1);
  const bakedThickness = clamp(bakedShade.y, 0.06, 4.0);
  const sky = clamp(bakedShade.z, 0, 1);
  const seamContact = clamp(float(1).sub(bakedShade.w), 0, 1);
  const [detailNear, detailFar] = profile.detailRange ?? [16, 48];
  const near = smoothstep(detailNear, detailFar, length(cameraPosition.sub(point))).oneMinus();
  const weights = triplanarWeights(geometryNormal);

  // Blend smooth interpolated normal with crisp facet normal so prisms & crystals catch sharp glints.
  const facetSharpness = profile.facetSharpness ?? 0.45;
  const facetN = safeFacetNormal(point, geometryNormal);
  const baseNormal = normalize(mix(geometryNormal, facetN, facetSharpness));
  const microStrength = (profile.microNormal ?? 0.08) * (1 - facetSharpness * 0.45);
  const normal = triplanarNormal(maps.ice.normal, point, baseNormal, weights, 0.85, microStrength).toVar();

  const ndv = clamp(dot(normal, viewDirection), 0.02, 1);
  const fresnel = schlickFresnel(ndv, ICE_F0);
  const into = refract(viewDirection.negate(), normal, 1 / ICE_IOR);
  const absorption = vec3(...(profile.absorption ?? [0.68, 0.16, 0.055]));
  const scatter = clamp(
    float(profile.cloud ?? 0.06)
      .add(locationNoise(NOISE.mottle, point.mul(1.2)).mul(0.05).add(0.05))
      .add(seamContact.mul(0.28)),
    0,
    0.75,
  );

  // Internal parallax fractures, veins, bubbles, and mirror sheets inside the crystal volume.
  const interior = iceInterior({
    point, into, weights, cracks: maps.cracks, packMap, absorption,
    layers: Math.min(layers, 3),
    crackGain: (profile.crackGain ?? 0.65) * 1.15,
    fracture: float(profile.fracture ?? 0.35),
    bubbles: float(profile.bubbles ?? 0.06),
    scatter,
    near,
  });

  // View-dependent frosted roughness variation: crystalline edges stay razor-glassy (~0.045).
  const frostNoise = locationNoise(NOISE.fbm, point.mul(2.4)).mul(0.5).add(0.5);
  const roughness = clamp(
    float(profile.roughness ?? 0.055)
      .add(frostNoise.mul(0.045))
      .add(scatter.mul(0.12))
      .add(seamContact.mul(0.18)),
    0.04,
    0.58,
  );

  // Environment reflection (cave skylight / glacier dome).
  const gloss = iceGloss({
    normal,
    f0: ICE_F0,
    open: sky,
    reflection: profile.reflection ?? { gain: 4.0, horizon: 2.4 },
    bakedLight,
  });

  const lightDir = normalize(bakedDirection.add(vec3(0, 0.4, 0)));
  const sparkle = iceSparkle({
    point, normal, packMap, lightDir, near,
    scale: 15.5, threshold: 0.72, strength: 1.35,
  });

  const iridPhase = locationNoise(NOISE.patch, point.mul(1.8)).mul(0.5).add(0.5);
  const iridescenceStrength = (profile.iridescence ?? 0.22) * 0.55;

  // Base body colour & optical path transmission.
  const thinCol = color(profile.thinColor ?? '#bceeff');
  const deepCol = color(profile.deepColor ?? '#0a2a4c');

  let transmitted = vec3(0);
  let effectiveThickness = bakedThickness.mul(mix(float(1.45), float(0.75), ndv));
  let transmissionShare = float(0);

  if (transmission) {
    // View-space surface normal drives physically intuitive screen-space refraction offset.
    const viewNorm = normalize(cameraViewMatrix.mul(vec4(normal, 0)).xyz);
    const baseUv = viewportSafeUV(screenUV);
    const distToCam = length(cameraPosition.sub(point));
    const refractAmp = float(profile.refractionStrength ?? 0.055)
      .mul(smoothstep(float(3), float(42), distToCam).oneMinus().mul(0.65).add(0.35))
      .mul(mix(float(1.2), float(0.65), ndv));
    const offset = vec2(viewNorm.x.negate(), viewNorm.y).mul(refractAmp);

    const uvR = viewportSafeUV(baseUv.add(offset.mul(DISPERSION_R)));
    const uvG = viewportSafeUV(baseUv.add(offset.mul(DISPERSION_G)));
    const uvB = viewportSafeUV(baseUv.add(offset.mul(DISPERSION_B)));

    // Depth-aware foreground rejection & real screen-space optical thickness.
    const depthRange = cameraFar.sub(cameraNear);
    const surfaceDist = linearDepth().mul(depthRange).add(cameraNear);
    const baseBehindDist = linearDepth(viewportDepthTexture(baseUv)).mul(depthRange).add(cameraNear);
    const refrBehindDist = linearDepth(viewportDepthTexture(uvG)).mul(depthRange).add(cameraNear);

    const behindValid = smoothstep(surfaceDist.add(0.02), surfaceDist.add(0.28), refrBehindDist);
    const safeUvR = mix(baseUv, uvR, behindValid);
    const safeUvG = mix(baseUv, uvG, behindValid);
    const safeUvB = mix(baseUv, uvB, behindValid);

    const opticalDelta = clamp(mix(baseBehindDist, refrBehindDist, behindValid).sub(surfaceDist), 0.06, 6.0);
    // Combine real behind-surface depth with baked thickness so thin icicles stay translucent and thick ice deepens.
    effectiveThickness = clamp(opticalDelta.mul(0.38).add(bakedThickness.mul(0.72)), 0.08, 3.6);

    const blurMip = clamp(roughness.mul(5.5).add(scatter.mul(2.4)).add(effectiveThickness.mul(0.28)), 0, 5.2);
    const sceneR = viewportOpaqueMipTexture(safeUvR, blurMip).r;
    const sceneG = viewportOpaqueMipTexture(safeUvG, blurMip).g;
    const sceneB = viewportOpaqueMipTexture(safeUvB, blurMip).b;
    const refractedScene = vec3(sceneR, sceneG, sceneB);

    // Beer-Lambert extinction + Total Internal Reflection darkening at extreme grazing angles.
    const beer = exp(absorption.mul(effectiveThickness.mul(1.25)).negate());
    const tir = smoothstep(0.06, 0.38, ndv).oneMinus().mul(0.45);
    const bodyDepth = mix(thinCol, deepCol, clamp(effectiveThickness.div(2.2), 0, 1));
    // Blend refracted scene with luminous glacial body scatter; thin crystal tips stay crisp glass-aqua.
    const clarity = clamp(float(profile.transmission ?? 0.84).mul(scatter.mul(0.65).oneMinus()).mul(tir.oneMinus()), 0.14, 0.92);
    transmitted = refractedScene.mul(beer).mul(fresnel.oneMinus())
      .add(bodyDepth.mul(vec3(1).sub(beer)).mul(0.46));
    transmissionShare = clarity;
  } else {
    // Low-tier opaque crystal fallback (zero viewport texture copy).
    const beer = exp(absorption.mul(effectiveThickness.mul(1.35)).negate());
    transmitted = mix(deepCol, thinCol, beer).mul(locationLight.ambientUp.mul(1.4).add(bakedLight.mul(0.65)));
    transmissionShare = float(0.42);
  }

  // Faceted surface diffuse + specular + clearcoat + backlit SSS (kept restrained where clear transmission dominates).
  const surfaceAlbedo = mix(deepCol, thinCol, exp(effectiveThickness.mul(-0.95)))
    .add(color(profile.scatterColor ?? '#a8e4f8').mul(interior).mul(1.15));

  const smooth = roughness.oneMinus().clamp(0, 1);
  // Crisp glacial rim & crystal-edge refraction glow, grounded in local baked + ambient lighting
  // so crystals in dark recesses stay moody sapphire rather than glowing white.
  const localLight = bakedLight.mul(0.62).add(locationLight.ambientUp.mul(0.75));
  const rimGlow = pow(ndv.oneMinus(), 3.0)
    .mul(mix(vec3(0.24, 0.72, 1.0), vec3(0.68, 0.94, 1.0), smooth))
    .mul(localLight)
    .mul(exp(effectiveThickness.mul(-0.65)).mul(0.65).add(0.35));

  const iridRim = iceIridescence(ndv, iridPhase, float(iridescenceStrength))
    .mul(localLight.add(0.05));

  const sparkleGlow = vec3(0.84, 0.96, 1.0).mul(sparkle).mul(localLight.mul(0.85).add(0.25)).mul(0.95);
  const mirrored = gloss.mirrored.mul(smooth.mul(smooth)).mul(mix(float(0.35), float(0.95), occlusion));

  // Scale diffuse contribution down where the crystal is glass-clear so refracted background dominates cleanly,
  // while keeping specular, clearcoat, internal fractures, SSS, and Fresnel reflections at full physical strength.
  const surfaceWeight = transmissionShare.mul(0.74).oneMinus();
  const shadedSurface = shadeIceSurface({
    albedo: surfaceAlbedo.mul(surfaceWeight),
    normal,
    roughness,
    f0: ICE_F0,
    wrap: 0.72,
    clearcoat: float(0.95),
    coatRoughness: 0.038,
    thickness: effectiveThickness,
    scatter,
    absorption,
    sssStrength: float(profile.translucency ?? 1.4).mul(0.36),
    iridescence: float(iridescenceStrength * 0.45),
    iridescencePhase: iridPhase,
    emissive: mirrored.mul(0.75).add(rimGlow.mul(0.65)).add(iridRim.mul(0.30)).add(sparkleGlow),
    bare: float(1),
  });

  // Composite refracted background + internal crystal glow + surface reflections/highlights.
  const internalHighlights = color(profile.scatterColor ?? '#98e2ff').mul(interior)
    .mul(bakedLight.mul(0.55).add(locationLight.ambientUp.mul(0.85)).add(0.06))
    .mul(0.68);
  const finalColor = transmitted.mul(transmissionShare)
    .add(shadedSurface)
    .add(internalHighlights);

  const material = new THREE.MeshBasicNodeMaterial({
    name,
    fog: true,
    transparent: transmission,
    depthWrite: true,
    forceSinglePass: transmission,
  });
  material.colorNode = finalColor;
  if (transmission) {
    // Refracted scene is already physically composited above; output alpha = 1 to avoid double-attenuation.
    material.opacityNode = float(1);
  }
  assignMaterialData(material, {
    roughness: profile.roughness ?? 0.05,
    reactive: 0.35,
    reflectionClass: REFLECTION_CLASSES.NONE,
    bloomBoost: 0.28,
  });
  return material;
}
