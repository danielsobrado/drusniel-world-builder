import * as THREE from 'three/webgpu';
import {
  abs, attribute, clamp, color, cos, dot, float, fwidth, length, max, mix, normalize,
  positionLocal, positionWorld, pow, sin, smoothstep, step, texture, time, uv, vec2, vec3,
} from 'three/tsl';
import {
  bakedDirection, bakedLight, bakedShade, createLocationMaterial, geometryNormal,
  shadeSurface, viewDirection,
} from './LocationShading.js';
import { NOISE, locationNoise } from './locationNoise.js';

/**
 * GPU wind-animated cloth & draped pelt shader for Frostgard flags, banners,
 * and drying-rack hides.
 *
 * Key properties:
 *   - 100% GPU vertex-stage multi-harmonic wind wave & trailing-edge flutter
 *     pinned at `clothData.x = 0` (hoist pole / drying rail) so CPU cost is zero.
 *   - Analytic wave-slope normal perturbation so sunlight rolls dynamically across
 *     every billow and fold on both sides of `DoubleSide` fabric.
 *   - `fwidth`-antialiased physical woven wool lattice (or coarse fur/suede grain
 *     for pelts), Charlie wool rim sheen, frost rime on upper folds, and sun
 *     backlit subsurface translucency.
 */

const TWO_PI = Math.PI * 2;

/**
 * @param {string} name
 * @param {object} profile resolved `materialProfiles.*` entry with `cloth` config
 * @param {{ wind?: number[], alpinePack?: THREE.Texture | null }} [options]
 */
export function createLocationClothMaterial(name, profile, { wind = [0.6, 0.8], alpinePack = null } = {}) {
  const cfg = typeof profile.cloth === 'object' ? profile.cloth : {};
  const isPelt = cfg.style === 'pelt';
  const windAmp = cfg.windAmp ?? (isPelt ? 0.045 : 0.13);
  const windSpeed = cfg.windSpeed ?? (isPelt ? 2.1 : 5.4);
  const weaveDensity = cfg.weaveDensity ?? (isPelt ? 18 : 42);
  const sheenStrength = cfg.sheen ?? (isPelt ? 0.24 : 0.36);
  const translucency = cfg.translucency ?? (isPelt ? 0.08 : 0.58);
  const borderDarken = cfg.borderDarken ?? (isPelt ? 0.72 : 0.56);

  const wLen = Math.hypot(wind[0] ?? 0.6, wind[1] ?? 0.8) || 1;
  const wx = (wind[0] ?? 0.6) / wLen;
  const wz = (wind[1] ?? 0.8) / wLen;

  const clothData = attribute('clothData', 'vec4');
  const pin = clamp(clothData.x, 0, 1);
  const phase = clothData.y;
  const borderMask = clamp(clothData.z, 0, 1);
  const flutterScale = clamp(clothData.w, 0, 1.5);
  const fabricUv = uv();
  const vertTint = attribute('tint', 'vec3');

  // --- GPU vertex wind wave (zero displacement when pin == 0, e.g. static indoor cloth) ---
  const gust = sin(time.mul(0.85).add(phase.mul(0.37))).mul(0.28)
    .add(sin(time.mul(1.7).add(phase.mul(0.71))).mul(0.14))
    .add(0.86);
  const along = fabricUv.x;
  const across = fabricUv.y;
  const w1Phase = along.mul(5.8).sub(time.mul(windSpeed)).add(phase);
  const w2Phase = along.mul(11.4).add(across.mul(4.5)).sub(time.mul(windSpeed * 1.68)).add(phase.mul(1.4));
  const w3Phase = along.mul(19.0).sub(across.mul(8.0)).sub(time.mul(windSpeed * 2.35)).add(phase.mul(2.1));

  const wave1 = sin(w1Phase);
  const wave2 = sin(w2Phase).mul(0.42);
  const wave3 = sin(w3Phase).mul(0.16);
  const dispAmp = pin.mul(flutterScale).mul(gust).mul(float(windAmp));
  const waveScalar = wave1.add(wave2).add(wave3).mul(dispAmp);

  // Subtle vertical whip & snap at trailing fly edge.
  const whipY = cos(w2Phase.mul(0.7)).mul(dispAmp).mul(isPelt ? 0.12 : 0.28);
  const rawNormal = normalize(attribute('normal', 'vec3'));
  // Push along both surface normal and slightly sideways to valley wind for authentic 3D billowing.
  const lateralAxis = normalize(vec3(wz, 0, -wx));
  const windAxis = normalize(rawNormal.mul(0.78).add(lateralAxis.mul(0.22)));
  const displacedLocal = positionLocal.add(windAxis.mul(waveScalar)).add(vec3(0, whipY, 0));

  // --- Analytic wave normal perturbation + double-sided camera-facing flip ---
  const dWaveDU = cos(w1Phase).mul(5.8)
    .add(cos(w2Phase).mul(11.4 * 0.42))
    .add(cos(w3Phase).mul(19.0 * 0.16))
    .mul(dispAmp);
  const dWaveDV = cos(w2Phase).mul(4.5 * 0.42)
    .sub(cos(w3Phase).mul(8.0 * 0.16))
    .mul(dispAmp);

  const flipSign = mix(float(-1), float(1), step(float(0), dot(geometryNormal, viewDirection)));
  const baseN = geometryNormal.mul(flipSign);
  const windFlow = normalize(vec3(wx, 0, wz));
  const foldTilt = windFlow.mul(dWaveDU.mul(-0.42)).add(vec3(0, dWaveDV.mul(-0.28), 0));

  // --- Physical woven wool lattice or coarse fur/suede micro-grain ---
  const weaveCoord = fabricUv.mul(weaveDensity);
  const footprint = length(fwidth(weaveCoord));
  const weaveFade = clamp(float(1).sub(footprint.mul(0.85)), 0, 1);
  const warp = sin(weaveCoord.x.mul(TWO_PI));
  const weft = sin(weaveCoord.y.mul(TWO_PI));
  const weaveH = warp.mul(weft);
  const weaveCavity = float(1).sub(weaveH.mul(-0.5).add(0.5).mul(isPelt ? 0.18 : 0.28).mul(weaveFade));

  const furGrain = alpinePack
    ? texture(alpinePack, fabricUv.mul(vec2(isPelt ? 3.2 : 2.1, isPelt ? 1.6 : 2.1))).b
    : locationNoise(NOISE.fbm, positionWorld.mul(6.5)).mul(0.5).add(0.5);
  const weatherMottle = locationNoise(NOISE.patch, positionWorld.mul(1.85).add(vec3(2.3, 4.1, 7.2))).mul(0.5).add(0.5);

  // Subtle fabric micro-normal bump from thread/fur structure + analytic fold slope.
  const weaveBumpU = cos(weaveCoord.x.mul(TWO_PI)).mul(weft).mul(weaveFade).mul(isPelt ? 0.05 : 0.11);
  const weaveBumpV = warp.mul(cos(weaveCoord.y.mul(TWO_PI))).mul(weaveFade).mul(isPelt ? 0.05 : 0.11);
  const normal = normalize(
    baseN.add(foldTilt).add(windFlow.mul(weaveBumpU)).add(vec3(0, weaveBumpV, 0)),
  );

  // --- Albedo: dyed heavy wool with stitched border stripe, or weathered animal pelt ---
  let albedo = color(profile.tint ?? '#ffffff').mul(vertTint);
  albedo = albedo.mul(weaveCavity).mul(mix(float(0.84), float(1.12), weatherMottle));
  if (isPelt) {
    // Coarse directional fur streaking & salt-cured leather tonal contrast.
    albedo = albedo.mul(mix(float(0.76), float(1.16), furGrain));
    albedo = mix(albedo, albedo.mul(float(borderDarken)), borderMask.mul(0.65));
  } else {
    // Authentic weathered Norths/Dwarven wool: keep saturation deep so firelit banners stay rich velvet (no neon bloom).
    albedo = albedo.mul(float(0.76));
    const trimTint = albedo.mul(float(borderDarken)).mul(vec3(0.58, 0.54, 0.52));
    albedo = mix(albedo, trimTint, borderMask.mul(0.84));
    albedo = mix(albedo, albedo.mul(1.06).add(vec3(0.02, 0.018, 0.018)), smoothstep(0.68, 1.0, pin).mul(0.18));
  }

  // Light frost rime clinging to upward-facing cloth folds exposed to the sky.
  const rime = smoothstep(0.32, 0.82, normal.y.add(weatherMottle.sub(0.5).mul(0.35)))
    .mul(bakedShade.z).mul(isPelt ? 0.36 : 0.24);
  albedo = mix(albedo, color('#dfeaf4'), rime);

  const roughness = clamp(
    float(profile.roughness ?? (isPelt ? 0.92 : 0.88))
      .add(weaveH.mul(0.08).mul(weaveFade))
      .add(furGrain.sub(0.5).mul(0.1))
      .sub(rime.mul(0.08)),
    0.58,
    0.98,
  );

  // --- Charlie wool grazing sheen + sky-gated sun backlit subsurface translucency ---
  const ndotv = clamp(dot(normal, viewDirection), 0, 1);
  const woolSheen = pow(max(float(1).sub(ndotv), 1e-4), 3.2)
    .mul(float(sheenStrength))
    .mul(albedo.add(vec3(0.08, 0.07, 0.07)))
    .mul(clamp(bakedShade.z.mul(0.7).add(0.25), 0.25, 1));

  const toLight = normalize(bakedDirection.add(vec3(0, 1e-4, 0)));
  const backlit = pow(clamp(dot(viewDirection.negate(), toLight), 0, 1), 3.4);
  const foldThin = mix(float(0.7), float(1.15), clamp(abs(wave1), 0, 1));
  // Gate translucent glow strictly by actual backlit sun alignment & sky visibility so indoor banners stay rich velvet.
  const clothSSS = bakedLight
    .mul(albedo)
    .mul(backlit)
    .mul(foldThin)
    .mul(float(translucency))
    .mul(clamp(bakedShade.z, 0, 1));

  const shaded = shadeSurface({
    albedo,
    normal,
    roughness,
    f0: float(0.025),
    metalness: 0,
    wrap: float(isPelt ? 0.32 : 0.38),
    emissive: woolSheen.mul(0.32).add(clothSSS),
    sheen: 0.14,
  });

  const material = createLocationMaterial(name, shaded);
  material.side = THREE.DoubleSide;
  material.positionNode = displacedLocal;
  return material;
}
