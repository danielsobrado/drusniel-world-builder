import { abs, dot, exp, fract, length, max, mix, smoothstep, step, vec3 } from 'three/tsl';
import { triplanarSample } from '../LocationShading.js';
import { NOISE, locationNoise } from '../locationNoise.js';

/** Metres below the surface at which the interior is sampled, nearest first. */
const LAYER_DEPTHS = [0.1, 0.4, 1.1, 2.4];
/** Texture repeats per metre for each layer: crystal boundaries near the surface, block fractures deeper. */
const CRACK_SCALE = [0.5, 0.27, 0.14, 0.08];
/** Layers that also get bubbles; deeper ones are too dim to pay for them. */
const DETAILED_LAYERS = 2;
/** Per-metre loss of the view into clear and into fully aerated ice: bubbly ice is opaque within decimetres. */
const VEIL_CLEAR = 0.11, VEIL_MILKY = 2.45;
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
const PLANE_DEPTH = 5.2;
/** Below this the ray is too close to parallel with a plane to find where it crosses. */
const MIN_CROSSING = 0.05;
/** Cosine of the ice–air critical angle, asin(1 / 1.31): a ray striking a fracture more obliquely is mirrored by it. */
const CRITICAL_COS = 0.64;
/** Brightness of the fracture faces: kept below the cracks' so a face reads as a sheet in the ice, never a white shard. */
const FACE_BASE = 0.18, FACE_PER_FRACTURE = 0.42;

function fracturePlane({ normal, spacing, salt }, { point, into, absorption, veil, threshold }) {
  const across = dot(point, normal).div(spacing);
  const toward = dot(into, normal);
  const crossing = max(abs(toward), MIN_CROSSING);
  const ahead = mix(fract(across), fract(across).oneMinus(), step(0, toward));
  const distance = ahead.mul(spacing).div(crossing);
  const hit = point.add(into.mul(distance));
  const patch = smoothstep(threshold, threshold.add(0.12), locationNoise(NOISE.patch, hit.mul(PLANE_EXTENT).add(salt)));
  const mirror = smoothstep(CRITICAL_COS + 0.1, CRITICAL_COS - 0.1, crossing).mul(0.82).add(0.18);
  // Subtle chromatic prism glint along critical-angle internal fracture sheets.
  const prismTint = mix(vec3(0.84, 0.96, 1.08), vec3(1.06, 0.98, 1.12), smoothstep(CRITICAL_COS + 0.04, CRITICAL_COS - 0.12, crossing));
  return exp(absorption.mul(distance.mul(-2))).mul(exp(veil.mul(distance).negate()))
    .mul(smoothstep(PLANE_DEPTH, PLANE_DEPTH * 0.58, distance)).mul(patch).mul(mirror).mul(prismTint);
}

/**
 * What can be seen inside the ice: multi-depth parallax cracks, packed CC0
 * crystalline fracture webs, bubbles and critical-angle mirror fracture sheets,
 * attenuated by Beer-Lambert absorption and aerated ice veiling.
 */
export function iceInterior({
  point,
  into,
  weights,
  cracks,
  packMap = null,
  absorption,
  layers,
  crackGain,
  fracture,
  bubbles,
  scatter,
  near,
}) {
  const count = Math.min(layers, LAYER_DEPTHS.length);
  const veil = mix(VEIL_CLEAR, VEIL_MILKY, scatter);
  const zone = smoothstep(-0.1, 0.35, locationNoise(NOISE.broad, point.mul(0.14))).mul(0.32).add(fracture.mul(1.55));
  const cluster = smoothstep(0, 0.45, locationNoise(NOISE.mottle, point.mul(0.9))).mul(bubbles).mul(1.25);

  let glow = vec3(0);
  let seen = exp(veil.mul(-LAYER_DEPTHS[0]));
  for (let index = 0; index < count; index += 1) {
    const depth = LAYER_DEPTHS[index];
    const inside = point.add(into.mul(depth)).add(index * 3.71);
    const slope = length(triplanarSample(cracks.normal, inside, weights, CRACK_SCALE[index]).xy.mul(2).sub(1));
    let crack = smoothstep(0.035, 0.155, slope).mul(zone).mul(crackGain);
    if (packMap && index < DETAILED_LAYERS) {
      // Layer crisp CC0 fracture lines from the packed crystal atlas on shallow depths.
      const packCrack = triplanarSample(packMap, inside, weights, CRACK_SCALE[index] * 0.72).r;
      const sharpLine = smoothstep(0.58, 0.88, packCrack).mul(zone).mul(crackGain * 0.75);
      crack = max(crack, sharpLine);
    }
    let light = crack;
    if (index < DETAILED_LAYERS) {
      light = light.add(smoothstep(0.42, 0.68, locationNoise(NOISE.pits, inside.mul(vec3(24, 7, 24)))).mul(cluster));
    }
    // Slight spectral shift with depth: shallow fractures read crisp ice-white/aqua, deep ones rich cyan-cobalt.
    const depthTint = mix(vec3(0.96, 1.0, 1.04), vec3(0.55, 0.90, 1.18), Math.min(1, depth / 2.2));
    glow = glow.add(exp(absorption.mul(-2 * depth)).mul(light).mul(seen).mul(depthTint));
    if (index + 1 < count) {
      seen = seen.mul(exp(veil.mul(depth - LAYER_DEPTHS[index + 1]))).mul(crack.mul(CRACK_COVER).clamp(0, 0.6).oneMinus());
    }
  }
  const threshold = fracture.mul(-0.45).add(0.34);
  let faces = vec3(0);
  for (const plane of PLANES) faces = faces.add(fracturePlane(plane, { point, into, absorption, veil, threshold }));
  return glow.div(count).mul(near).add(faces.mul(fracture.mul(FACE_PER_FRACTURE).add(FACE_BASE)).mul(crackGain));
}
