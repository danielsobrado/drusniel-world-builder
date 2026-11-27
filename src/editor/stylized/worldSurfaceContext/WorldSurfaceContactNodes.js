import {
  cameraViewMatrix,
  clamp,
  dot,
  float,
  min,
  mix,
  normalize,
  positionWorld,
  smoothstep,
  vec3,
  vec4,
} from 'three/tsl';
import { blendCoat } from '../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { groundFillLight } from '../forest/foliageLight.js';
import {
  resolveContactProfile,
  worldSurfaceContactConfig,
} from './WorldSurfaceContactConfig.js';

const LUMA_WEIGHTS = Object.freeze([0.2126, 0.7152, 0.0722]);

/** The contact each material met the ground through, for its emission writer (`groundLitEmission`). */
const groundContacts = new WeakMap();
/** Emission nodes whose contact band is lit as the ground (`isGroundLit` finds them in a material). */
const groundLitNodes = new WeakSet();
const unchangedLight = (emission) => emission;

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
 * @param {(albedo: object, canopy: object) => object} [options.groundFill] the fill light the ground at the
 *   foot takes (`groundFillLight`, the terrain's; town foundations stand on paving and pass its own)
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
  groundFill = groundFillLight,
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
      groundLight: unchangedLight,
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

  // Light continuity: every object family lights itself with its own fill (bark,
  // stone, shrub, house), several times the floor's under a canopy, so where it meets
  // the ground it glowed over a darkened floor. Inside the contact band its fill
  // becomes the floor's own, so the join is lit as one surface. This follows the band,
  // not the colour mask: a boulder in snow keeps its stone but not a brighter foot.
  //
  // Under a canopy no object's fill may be brighter than the floor's around it: a
  // family's fill is tuned for open ground (stone's is 3.5x bark's, so a backlit boulder
  // is not a black lump), and under the crowns it kept a woodland boulder lit ~3x its
  // floor (2026-11-27 ground-continuity QA). Weighted by canopy, the fill is capped at
  // what the floor would take with this albedo; a fill already below it is untouched.
  const lightCoverage = contactMask.mul(validity).clamp(0, 1);
  const canopy = wsc.canopy ?? float(0);
  const underCanopy = canopy.mul(validity).clamp(0, 1);
  const groundLight = (emission, albedo = outColor) => {
    const ground = groundFill(albedo, canopy);
    const shaded = mix(emission, min(emission, ground), underCanopy);
    const lit = mix(shaded, ground, lightCoverage);
    groundLitNodes.add(lit);
    return lit;
  };

  return {
    color: outColor,
    roughness: outRoughness,
    metalness: colorBlended.metalness,
    normal: outNormal,
    heightAbove,
    contactMask,
    coverage: colorCoverage,
    contactAo,
    lightCoverage,
    groundLight,
  };
}

/** Records the contact a material meets the ground through, for `groundLitEmission`. */
export function publishGroundContact(material, contact) {
  groundContacts.set(material, contact);
  return contact;
}

/**
 * A material's fill emission with its contact band lit as the ground is, for a
 * family whose contact is built in one place (weathering) and its fill in another.
 */
export function groundLitEmission(material, emission, albedo) {
  const contact = groundContacts.get(material);
  return contact ? contact.groundLight(emission, albedo) : emission;
}

/**
 * Whether a material's emission lights its contact band as the ground. Every family
 * that meets the ground through `applyWorldSurfaceContact` and adds a fill must;
 * `tests/worldSurfaceContextGroundLight.test.js` holds each to it.
 */
export function isGroundLit(material) {
  const seen = new Set();
  const stack = material.emissiveNode ? [material.emissiveNode] : [];
  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    if (groundLitNodes.has(node)) return true;
    seen.add(node);
    for (const child of node.getChildren?.() ?? []) stack.push(child);
  }
  return false;
}
