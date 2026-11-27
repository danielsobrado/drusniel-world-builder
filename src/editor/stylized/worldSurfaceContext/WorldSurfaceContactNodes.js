import {
  cameraViewMatrix,
  clamp,
  dot,
  float,
  mix,
  normalize,
  positionWorld,
  smoothstep,
  vec3,
  vec4,
} from 'three/tsl';
import { blendCoat } from '../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import {
  resolveContactProfile,
  worldSurfaceContactConfig,
} from './WorldSurfaceContactConfig.js';

const LUMA_WEIGHTS = Object.freeze([0.2126, 0.7152, 0.0722]);

/**
 * Pure generic World Surface Context (WSC) contact material blending helper (PR 4).
 *
 * Combines an object's base PBR state (`color`, optional `roughness`, `metalness`,
 * view-space `normal`), a WSC sample (`wsc` from `sampleWorldSurfaceContextVarying`
 * or `sampleWorldSurfaceContextAt`), and a YAML-configured contact profile via
 * `PbrCoatBlend.blendCoat`.
 *
 * Design guarantees:
 * - Zero extra WebGPU sampler bindings (consumes the caller's existing WSC sample).
 * - Outside the profile's contact height band, `contactMask` smoothly reaches `0`
 *   so every object retains 100% of its authored material identity.
 * - Preserves subtle object micro-grain inside the collar (`preserveIdentity`)
 *   rather than airbrushing roots/bark/stone facets into a flat smear.
 * - Gracefully falls back outside the 128 m WSC window using `fallbackHeight` /
 *   `fallbackAlbedo` when supplied, or attenuates cleanly by `wsc.validity` when
 *   no fallback is provided, preventing popping across streaming edges.
 * - Keeps contact AO orthogonal (`applyAo` flag) so families with existing foot
 *   occlusion (e.g. `understoryFootShade`) never double-count AO.
 *
 * @param {object} options
 * @param {{ color: object, roughness?: object, metalness?: object, normal?: object }} options.surface
 * @param {object} options.wsc WSC sample (`height`, `normal`, `validity`, `albedo`, `roughness`, `contact`, ...)
 * @param {string | object} options.profile profile name (`'tree'`, `'rock'`, `'debris'`, ...) or profile override
 * @param {object} [options.worldY] world-space Y node (defaults to `positionWorld.y`)
 * @param {object | null} [options.fallbackHeight] local-space height in metres used outside the WSC window
 * @param {object | null} [options.fallbackAlbedo] fallback linear RGB albedo outside the WSC window
 * @param {object | null} [options.fallbackRoughness] fallback roughness outside the WSC window
 * @param {object | null} [options.noiseOffset] centered noise in `[-0.5, 0.5]` breaking up the contact edge
 * @param {object | null} [options.mask] optional caller coverage multiplier (`0..1`)
 * @param {object | null} [options.heightScale] optional multiplier on profile blend heights (e.g. object height scale)
 * @param {boolean} [options.applyAo] whether to multiply `color` by orthogonal WSC contact AO (default `true`)
 * @param {object} [options.config] resolved `worldSurfaceContext.contact` config
 */
export function applyWorldSurfaceContact({
  surface,
  wsc,
  profile,
  worldY = positionWorld.y,
  fallbackHeight = null,
  fallbackAlbedo = null,
  fallbackRoughness = float(0.92),
  noiseOffset = null,
  mask = null,
  aoMask: callerAoMask = null,
  heightScale = null,
  applyAo = true,
  config = worldSurfaceContactConfig(),
}) {
  const cfg = config ?? worldSurfaceContactConfig();
  const resolved = resolveContactProfile(profile, cfg);
  const validity = wsc.validity ?? wsc.inside;

  const worldHeightAbove = worldY.sub(wsc.height);
  const heightAbove = fallbackHeight
    ? mix(fallbackHeight, worldHeightAbove, validity)
    : worldHeightAbove;

  if (!cfg.enabled) {
    return {
      color: surface.color,
      roughness: surface.roughness,
      metalness: surface.metalness,
      normal: surface.normal,
      heightAbove,
      contactMask: float(0),
      coverage: float(0),
      contactAo: float(1),
    };
  }

  const hScale = heightScale ? float(heightScale).max(0.2) : float(1);
  const blendStart = float(resolved.blendStartMeters).mul(hScale);
  const blendTop = float(resolved.blendHeightMeters).mul(hScale);
  const edgePerturb = (noiseOffset && resolved.noiseAmplitudeMeters > 0)
    ? noiseOffset.mul(float(resolved.noiseAmplitudeMeters).mul(hScale))
    : float(0);

  const contactMask = smoothstep(blendStart, blendTop, heightAbove.add(edgePerturb)).oneMinus().clamp(0, 1);
  const callerMask = mask ? float(mask).clamp(0, 1) : float(1);
  const effectiveWeight = fallbackAlbedo ? contactMask.mul(callerMask) : contactMask.mul(callerMask).mul(validity);
  const colorCoverage = effectiveWeight.mul(resolved.surfaceShare).clamp(0, 1);

  const wscAlbedo = wsc.albedo ?? wsc.soilColor;
  const rawCoatAlbedo = fallbackAlbedo ? mix(fallbackAlbedo, wscAlbedo, validity) : wscAlbedo;

  // Preserve subtle bark fissures / stone facet relief through the soil collar so
  // contact zones grip the ground organically instead of turning flat.
  let coatAlbedo = rawCoatAlbedo;
  if (resolved.preserveIdentity > 0) {
    const baseLuma = dot(surface.color, vec3(LUMA_WEIGHTS[0], LUMA_WEIGHTS[1], LUMA_WEIGHTS[2]));
    const grainFactor = clamp(baseLuma.mul(3.2).add(0.45), 0.72, 1.28);
    coatAlbedo = mix(rawCoatAlbedo, rawCoatAlbedo.mul(grainFactor), resolved.preserveIdentity);
  }

  // Compose base PBR channels with the WSC ground coat via PbrCoatBlend.
  const wscRough = wsc.roughness ?? fallbackRoughness;
  const coatRoughness = fallbackRoughness ? mix(fallbackRoughness, wscRough, validity) : wscRough;

  // Color + optional metalness via blendCoat (using colorCoverage).
  const baseForColor = {
    color: surface.color,
    roughness: surface.roughness ?? coatRoughness,
    ...(surface.metalness !== undefined ? { metalness: surface.metalness } : {}),
  };
  const colorBlended = blendCoat(
    baseForColor,
    { color: coatAlbedo, roughness: coatRoughness, metalness: float(0) },
    colorCoverage,
  );

  // Roughness uses its own profile share (`roughnessShare`) so glossy/sheeny bark or
  // rock dissolves cleanly into the ground's resolved matte/wet roughness right at the seam.
  let outRoughness = surface.roughness;
  if (surface.roughness !== undefined) {
    const roughCoverage = effectiveWeight.mul(resolved.roughnessShare).clamp(0, 1);
    outRoughness = mix(surface.roughness, coatRoughness, roughCoverage);
  }

  // Normal aligns toward the WSC terrain slope normal inside `validity` only.
  let outNormal = surface.normal;
  if (surface.normal && resolved.normalShare > 0) {
    const groundViewNormal = normalize(cameraViewMatrix.mul(vec4(wsc.normal, 0)).xyz);
    const normalCoverage = contactMask.mul(callerMask).mul(resolved.normalShare).mul(validity).clamp(0, 1);
    outNormal = blendCoat(
      { color: surface.color, roughness: outRoughness ?? coatRoughness, normal: surface.normal },
      { color: coatAlbedo, roughness: coatRoughness, normal: groundViewNormal },
      normalCoverage,
    ).normal;
  }

  // Orthogonal WSC contact AO (never baked into wscBaseTexture).
  // `callerAoMask` defaults to `callerMask` so snow-country rocks can suppress
  // mud collars (`mask = 0`) while retaining genuine rock-to-snow base occlusion.
  const aoTop = float(resolved.aoHeightMeters).mul(hScale);
  const aoBand = smoothstep(float(0), aoTop, heightAbove).oneMinus().clamp(0, 1);
  const aoStrength = wsc.contact.mul(resolved.contactAoField).add(resolved.contactAoBase);
  const effectiveAoMask = callerAoMask ? float(callerAoMask).clamp(0, 1) : callerMask;
  const contactAo = float(1).sub(aoBand.mul(aoStrength).mul(effectiveAoMask)).clamp(0.45, 1);
  const outColor = applyAo ? colorBlended.color.mul(contactAo) : colorBlended.color;

  return {
    color: outColor,
    roughness: outRoughness,
    metalness: colorBlended.metalness,
    normal: outNormal,
    heightAbove,
    contactMask,
    coverage: colorCoverage,
    contactAo,
  };
}
