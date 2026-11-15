import { abs, dot, exp, fract, length, max, mix, mx_noise_float, smoothstep, step, vec3 } from 'three/tsl';
import { triplanarSample } from '../LocationShading.js';

/** Metres below the surface at which the interior is sampled, nearest first. */
const LAYER_DEPTHS = [0.1, 0.4, 1.1, 2.4];
/** Texture repeats per metre for each layer: crystal boundaries near the surface, block fractures deeper. */
const CRACK_SCALE = [0.5, 0.27, 0.14, 0.08];
/** Layers that also get bubbles; deeper ones are too dim to pay for them. */
const DETAILED_LAYERS = 2;
/** Per-metre loss of the view into clear and into fully aerated ice: bubbly ice is opaque within decimetres. */
const VEIL_CLEAR = 0.12, VEIL_MILKY = 2.5;
/** How much of what lies behind a crack the crack itself hides. */
const CRACK_COVER = 0.5;
/** Fracture plane families: a normal and the spacing of parallel planes in metres. */
const PLANES = [
  { normal: [0.78, 0.3, 0.55], spacing: 6.5, salt: 3.1 },
  { normal: [-0.42, 0.25, 0.87], spacing: 9, salt: 17.3 },
].map(({ normal, spacing, salt }) => ({ normal: vec3(...normal.map((c) => c / Math.hypot(...normal))), spacing, salt }));
/** Patches of a fracture plane per metre: each face is a few metres across. */
const PLANE_EXTENT = 0.16;
/** Deepest a fracture face is drawn, metres. */
const PLANE_DEPTH = 5;
/** Below this the ray is too close to parallel with a plane to find where it crosses. */
const MIN_CROSSING = 0.05;
/** Cosine of the ice–air critical angle, asin(1 / 1.31): a ray striking a fracture more obliquely is mirrored by it. */
const CRITICAL_COS = 0.64;
/** Brightness of the fracture faces: kept below the cracks' so a face reads as a sheet in the ice, never a white shard. */
const FACE_BASE = 0.15, FACE_PER_FRACTURE = 0.35;

/**
 * A fracture face crossing the ice: where the refracted ray meets it, its patch
 * of the plane, and how bright the face is there. Seen past the critical angle a
 * fracture is a mirror of the light inside the ice; seen square-on it all but
 * vanishes. Where it reaches the surface it draws a crack line that fades into
 * the ice on one side only.
 */
function fracturePlane({ normal, spacing, salt }, { point, into, absorption, veil, threshold }) {
  const across = dot(point, normal).div(spacing);
  const toward = dot(into, normal);
  const crossing = max(abs(toward), MIN_CROSSING);
  const ahead = mix(fract(across), fract(across).oneMinus(), step(0, toward));
  const distance = ahead.mul(spacing).div(crossing);
  const hit = point.add(into.mul(distance));
  const patch = smoothstep(threshold, threshold.add(0.12), mx_noise_float(hit.mul(PLANE_EXTENT).add(salt)));
  const mirror = smoothstep(CRITICAL_COS + 0.1, CRITICAL_COS - 0.1, crossing).mul(0.8).add(0.2);
  return exp(absorption.mul(distance.mul(-2))).mul(exp(veil.mul(distance).negate()))
    .mul(smoothstep(PLANE_DEPTH, PLANE_DEPTH * 0.6, distance)).mul(patch).mul(mirror);
}

/**
 * What can be seen inside the ice: cracks, fracture faces and bubbles, sampled
 * at several depths along the refracted view ray. Each depth is dimmed by the
 * ice in front of it twice over: absorbed (deep layers arrive bluer) and veiled
 * by the cloud and the nearer cracks (deep layers vanish in milky ice). Because
 * each depth is a different point in the world, the layers slide over one
 * another as the camera moves — which is what separates a crack in the ice from
 * a line drawn on it.
 *
 * Crack lines are the slope of a photographed crack network's normal map: thin
 * and connected, where thresholding its colour gives white plates.
 *
 * @param {object} options
 * @param {Node} options.point surface point, world space
 * @param {Node} options.into refracted view direction, pointing into the ice
 * @param {Node} options.weights triplanar weights
 * @param {{ normal: Texture }} options.cracks the crack network set
 * @param {Node} options.absorption per-metre rgb extinction
 * @param {number} options.layers how many depths to sample (quality)
 * @param {number} options.crackGain
 * @param {Node} options.fracture 0..1
 * @param {Node} options.bubbles 0..1
 * @param {Node} options.scatter 0 clear .. 1 white: how far into the ice the eye can see
 * @param {Node} options.near 1 close to the camera, 0 where fine cracks and bubbles would only shimmer
 * @returns {Node} rgb light scattered back toward the eye, before the profile's scatter colour
 */
export function iceInterior({ point, into, weights, cracks, absorption, layers, crackGain, fracture, bubbles, scatter, near }) {
  const count = Math.min(layers, LAYER_DEPTHS.length);
  const veil = mix(VEIL_CLEAR, VEIL_MILKY, scatter);
  // Cracks gather into fractured zones and leave clear ice between them.
  const zone = smoothstep(-0.1, 0.35, mx_noise_float(point.mul(0.14))).mul(0.3).add(fracture.mul(1.5));
  // Bubbles string out along the vertical, the way they rose before the ice closed on them.
  const cluster = smoothstep(0, 0.45, mx_noise_float(point.mul(0.9))).mul(bubbles).mul(1.2);
  let glow = vec3(0);
  let seen = exp(veil.mul(-LAYER_DEPTHS[0]));
  for (let index = 0; index < count; index += 1) {
    const depth = LAYER_DEPTHS[index];
    // Each layer is shifted so the same crack is never stacked above itself.
    const inside = point.add(into.mul(depth)).add(index * 3.71);
    const slope = length(triplanarSample(cracks.normal, inside, weights, CRACK_SCALE[index]).xy.mul(2).sub(1));
    const crack = smoothstep(0.035, 0.16, slope).mul(zone).mul(crackGain);
    let light = crack;
    if (index < DETAILED_LAYERS) {
      light = light.add(smoothstep(0.42, 0.68, mx_noise_float(inside.mul(vec3(24, 7, 24)))).mul(cluster));
    }
    // In to the feature and back out again.
    glow = glow.add(exp(absorption.mul(-2 * depth)).mul(light).mul(seen));
    if (index + 1 < count) {
      seen = seen.mul(exp(veil.mul(depth - LAYER_DEPTHS[index + 1]))).mul(crack.mul(CRACK_COVER).clamp(0, 0.6).oneMinus());
    }
  }
  // A few bold faces, readable well past the fine cracks; how many grows with the fracture amount.
  const threshold = fracture.mul(-0.45).add(0.35);
  let faces = vec3(0);
  for (const plane of PLANES) faces = faces.add(fracturePlane(plane, { point, into, absorption, veil, threshold }));
  return glow.div(count).mul(near).add(faces.mul(fracture.mul(FACE_PER_FRACTURE).add(FACE_BASE)).mul(crackGain));
}
