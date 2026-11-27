import { float, mix, vec3 } from 'three/tsl';

/**
 * Spatial ambient for a scattered receiver (WSC PR 9): how much of the sky fill
 * reaches it and what the ground beside it bounces back, from the World Surface
 * Context under it, instead of one camera-global hemisphere.
 *
 * The sky fills on stones and bark (`foliageLight.js`) are emissive stand-ins for
 * sky light. Unattenuated, a boulder under a closed canopy glowed as brightly as
 * one in a meadow (`DEF-10`), and every receiver took the same hemisphere ground
 * colour whether it stood on sand, moss or snow. This is the PR-G "ground bounce"
 * idea at WSC scale — local albedo, canopy, contact — without probes: it rescales
 * the existing fills rather than adding light over them, so nothing is lit twice.
 *
 * Outside the WSC window (validity 0) both terms are exactly the old ones.
 */
/** Share of the sky fill a full canopy overhead takes away. */
export const AMBIENT_CANOPY_OCCLUSION = 0.65;
/** Share a fully occluded foot (WSC contact) takes away on top of that. */
export const AMBIENT_CONTACT_OCCLUSION = 0.35;
/** The ground albedo the hemisphere's ground colour stands for (linear). */
export const BOUNCE_REFERENCE_ALBEDO = 0.2;
/** Brightest a local ground may bounce relative to that reference (fresh snow, pale sand). */
export const BOUNCE_ALBEDO_GAIN_MAX = 2.2;
/** Share of the bounce left where the ground itself lies under full canopy. */
export const BOUNCE_UNDER_CANOPY = 0.45;

const LUMA = [0.2126, 0.7152, 0.0722];

/**
 * @param {object} wsc a WSC sample (`sampleWorldSurfaceContextVarying`): validity, canopy, contact, albedo
 * @param {object} groundColor the hemisphere ground colour node (`foliageLight.groundColor`)
 * @returns {{ skyVisibility: object, groundBounce: object }} a 0..1 sky share and the bounce colour that replaces `groundColor`
 */
export function worldSurfaceAmbient(wsc, groundColor) {
  const validity = wsc.validity.clamp(0, 1);
  const open = float(1).sub(wsc.canopy.mul(AMBIENT_CANOPY_OCCLUSION))
    .mul(float(1).sub(wsc.contact.mul(AMBIENT_CONTACT_OCCLUSION)));
  const skyVisibility = mix(float(1), open, validity);
  const energy = groundColor.dot(vec3(...LUMA));
  const gain = wsc.albedo.div(BOUNCE_REFERENCE_ALBEDO).min(BOUNCE_ALBEDO_GAIN_MAX);
  const shaded = float(1).sub(wsc.canopy.mul(1 - BOUNCE_UNDER_CANOPY));
  const local = gain.mul(energy).mul(shaded);
  return { skyVisibility, groundBounce: mix(groundColor, local, validity) };
}

/** CPU mirror of `worldSurfaceAmbient` on plain numbers and `[r, g, b]` arrays, for tests and QA. */
export function worldSurfaceAmbientCpu({ validity, canopy, contact, albedo }, groundColor) {
  const v = Math.min(1, Math.max(0, validity));
  const open = (1 - canopy * AMBIENT_CANOPY_OCCLUSION) * (1 - contact * AMBIENT_CONTACT_OCCLUSION);
  const energy = groundColor.reduce((sum, c, i) => sum + c * LUMA[i], 0);
  const shaded = 1 - canopy * (1 - BOUNCE_UNDER_CANOPY);
  const local = albedo.map(a => Math.min(BOUNCE_ALBEDO_GAIN_MAX, a / BOUNCE_REFERENCE_ALBEDO) * energy * shaded);
  return {
    skyVisibility: 1 + (open - 1) * v,
    groundBounce: groundColor.map((g, i) => g + (local[i] - g) * v),
  };
}
