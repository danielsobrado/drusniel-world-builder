import { cos, dot, float, max, mix, normalWorld, positionGeometry, positionView, positionViewDirection, sin, smoothstep, vec2, vec3 } from 'three/tsl';

/** Share of a leaf's card cut left to thin at the very edge of the crown. */
const EDGE_THIN = 0.28;
/** Alpha above the cut across which a leaf's 1-2 texel rim fades into its body. */
const FRINGE_ALPHA = 0.30;
/** How much of a rim texel the sky/air behind it replaces: inside the crown, at its edge. */
const SKY_INSIDE = 0.02;
const SKY_EDGE = 0.10;

/** True geometric card face normal in view space (after instancing & wind, before puff-normal blending). */
function cardFacingView() {
  const faceNormal = positionView.dFdx().cross(positionView.dFdy()).add(vec3(0, 0, 1e-6)).normalize();
  return faceNormal.dot(positionViewDirection).abs();
}

/**
 * Lets a textured crown dissolve into the sky rather than cut out of it.
 *
 * An alpha cut has no in-between: a dark leaf ends on a hard line against bright
 * sky. Blending or dithering the cut would fix the line at a cost (sorting, or the
 * screen-pattern sparkle StylizedDitheredMaterial removed), so this keeps the stable
 * cut and works on what is either side of it. Leaves at the crown's outside are
 * thinned so it ends in sprays, edge-on cards fade before forming dark slivers,
 * and each leaf's rim takes the ambient air/sky colour behind it.
 *
 * @param {object} alpha float node, the leaf map's alpha
 * @param {object} options
 * @param {number} options.cut the material's alpha test
 * @param {number} options.radius metres from the trunk axis to the crown's outside
 * @param {object} options.height 0..1 up the crown
 */
export function crownEdgeNodes(alpha, { cut, radius, height, centerXZ = null }) {
  const radialXZ = centerXZ
    ? positionGeometry.xz.sub(vec2(centerXZ[0], centerXZ[1]))
    : positionGeometry.xz;
  const outer = smoothstep(0.55, 1, radialXZ.length().div(Math.max(0.001, radius)));
  const edge = max(outer, smoothstep(0.72, 1, height));
  const rim = smoothstep(cut, cut + FRINGE_ALPHA, alpha).oneMinus();
  const grazingKeep = mix(float(1), smoothstep(0.09, 0.40, cardFacingView()), edge.mul(0.50).add(0.35));
  // Prototype-space bristle/felt feathering on the outermost alpha fringe (zero screen shimmer).
  const bristleA = sin(dot(positionGeometry.mul(47.3), vec3(12.9898, 78.233, 37.719)));
  const bristleB = cos(dot(positionGeometry.mul(91.7), vec3(39.346, 11.135, 83.155)));
  const bristle = bristleA.mul(0.6).add(bristleB.mul(0.4)).mul(0.5);
  const feather = float(1).add(bristle.mul(rim).mul(edge).mul(0.28));
  // Favour skyward outer leaves so lower flanks in front of hills or roofs keep crisp contrast.
  const skyExposure = smoothstep(-0.25, 0.55, normalWorld.y).mul(0.55).add(0.45);
  return {
    opacity: alpha.mul(float(1).sub(edge.mul(EDGE_THIN))).mul(grazingKeep).mul(feather).clamp(0, 1),
    sky: rim.mul(edge.mul(SKY_EDGE - SKY_INSIDE).add(SKY_INSIDE)).mul(skyExposure),
  };
}

/**
 * Softens alpha-cutout bush and understory cards on the GPU: fades edge-on cards
 * before they draw dark slivers and lifts the outer 1-2 fringe pixels toward air.
 */
export function understoryEdgeNodes(alpha, { cut = 0.35, greenMask = float(1) } = {}) {
  const rim = smoothstep(cut, cut + 0.5, alpha).oneMinus().mul(greenMask);
  const grazingKeep = mix(float(1), smoothstep(0.07, 0.32, cardFacingView()), greenMask.mul(0.72));
  return {
    opacity: alpha.mul(grazingKeep),
    airRim: rim.mul(0.14),
  };
}
