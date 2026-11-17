import { float, mix, normalize, positionView, smoothstep } from 'three/tsl';

/**
 * Composition shared by the surface coatings (snow, moss): a coat's PBR channels
 * laid over a base's by coverage. Pure — it reads no textures, biomes or state,
 * and mutates nothing; callers decide coverage and appearance and assign the result.
 *
 * Normals are unit view-space vectors, as `MeshStandardNodeMaterial.normalNode`
 * takes them; a channel either side leaves out is passed through from the base.
 *
 * @param {{ color, roughness, metalness?, normal? }} base
 * @param {{ color, roughness, metalness?, normal? }} coat
 * @param {import('three/tsl').Node} coverage 0..1
 */
export function blendCoat(base, coat, coverage) {
  const weight = float(coverage).clamp(0, 1);
  const out = {
    color: mix(base.color, coat.color, weight),
    roughness: mix(base.roughness, coat.roughness, weight),
  };
  if (base.metalness !== undefined) out.metalness = mix(base.metalness, coat.metalness ?? float(0), weight);
  if (base.normal) out.normal = coat.normal ? normalize(mix(base.normal, coat.normal, weight)) : base.normal;
  return out;
}

/**
 * Unit view normal `n` turned by a tangent-space normal `sample` (unpacked, -1..1)
 * that is mapped on coordinates whose screen derivatives are `dx`, `dy`: the
 * cotangent frame those derivatives span, so any projection and any instance
 * transform work without a tangent attribute. Derivatives are taken here, so call
 * it in uniform control flow.
 */
export function perturbByMap(n, sample, dx, dy, strength) {
  const q0 = positionView.dFdx(), q1 = positionView.dFdy();
  const q1perp = q1.cross(n), q0perp = n.cross(q0);
  const t = q1perp.mul(dx.x).add(q0perp.mul(dy.x));
  const b = q1perp.mul(dx.y).add(q0perp.mul(dy.y));
  const scale = t.dot(t).max(b.dot(b)).max(1e-20).inverseSqrt();
  const xy = sample.xy.mul(strength).mul(scale);
  return normalize(t.mul(xy.x).add(b.mul(xy.y)).add(n.mul(sample.z)));
}

/**
 * Unit view normal `n` tilted by the screen gradient of a height field, in the
 * same units as the view (metres). The tilt is capped at `maxSlope`: the
 * gradient is per 2x2 quad, and uncapped a fine field draws as blocks.
 */
export function perturbByHeight(n, height, maxSlope = 0.6) {
  const q0 = positionView.dFdx(), q1 = positionView.dFdy();
  const r1 = q1.cross(n), r2 = n.cross(q0);
  const det = q0.dot(r1);
  const slope = det.sign().mul(height.dFdx().mul(r1).add(height.dFdy().mul(r2))).div(det.abs().max(1e-12));
  const limited = slope.mul(float(maxSlope).div(slope.length().max(maxSlope)));
  return normalize(n.sub(limited));
}

/**
 * 1 near the eye, 0 past `far` metres: coat micro-detail fades with distance
 * so its normals do not shimmer where a pixel covers a hand's breadth.
 */
export function coatDetailFade({ nearDistance, farDistance }) {
  return smoothstep(nearDistance, farDistance, positionView.z.negate()).oneMinus();
}
