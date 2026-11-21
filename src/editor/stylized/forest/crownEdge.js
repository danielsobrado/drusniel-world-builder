import { float, max, mix, positionGeometry, positionView, positionViewDirection, smoothstep, vec3 } from 'three/tsl';

/** Share of a leaf's card cut left to thin at the very edge of the crown. */
const EDGE_THIN = 0.36;
/** Alpha above the cut across which a leaf's rim fades into its body. */
const FRINGE_ALPHA = 0.62;
/** How much of a rim texel the sky/air behind it replaces: inside the crown, at its edge. */
const SKY_INSIDE = 0.14;
const SKY_EDGE = 0.72;

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
export function crownEdgeNodes(alpha, { cut, radius, height }) {
  const outer = smoothstep(0.5, 1, positionGeometry.xz.length().div(Math.max(0.001, radius)));
  const edge = max(outer, smoothstep(0.7, 1, height));
  const rim = smoothstep(cut, cut + FRINGE_ALPHA, alpha).oneMinus();
  // True geometric card face normal in view space (after instancing & wind, before puff-normal blending).
  const faceNormal = positionView.dFdx().cross(positionView.dFdy()).add(vec3(0, 0, 1e-6)).normalize();
  const cardFacing = faceNormal.dot(positionViewDirection).abs();
  const grazingKeep = mix(float(1), smoothstep(0.08, 0.32, cardFacing), edge.mul(0.65).add(0.15));
  return {
    opacity: alpha.mul(float(1).sub(edge.mul(EDGE_THIN))).mul(grazingKeep),
    sky: rim.mul(edge.mul(SKY_EDGE - SKY_INSIDE).add(SKY_INSIDE)),
  };
}
