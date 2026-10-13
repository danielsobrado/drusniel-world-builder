import { abs, color, floor, fract, min, mix, normalGeometry, positionGeometry, sin, smoothstep, uniform, vec3 } from 'three/tsl';

/** Firelight behind glass: warm, and held under white so the leading and the quarries still read. */
const WINDOW_GLOW = color('#ff9a3d');
/**
 * Glass as the kit's towns draw it: faintly lit by day, so a window reads as a
 * room behind it. Old crown glass is never one sheet: each quarry is its own
 * piece, a little greener or paler or darker than the next, and it is glossy
 * enough to catch the sky.
 */
const PANE = vec3(0.1, 0.105, 0.09);
const PANE_GREEN = vec3(0.07, 0.1, 0.075);
const LEAD = vec3(0.03, 0.03, 0.03);
const PANE_DAY_GLOW = color('#ffe0a8').mul(0.08);
/** Diamond quarries of the leading, in metres along the diagonal. */
const QUARRY = 0.22;

/**
 * Leaded glazing over a recess face, from its position alone (the workshop
 * gives recesses no UVs): diamond quarries across the face's horizontal axis
 * and its height. 1 on the lead, 0 on the glass.
 */
function quarries() {
  const across = positionGeometry.x.mul(normalGeometry.z.negate()).add(positionGeometry.z.mul(normalGeometry.x));
  const u = across.add(positionGeometry.y).div(QUARRY);
  const v = across.sub(positionGeometry.y).div(QUARRY);
  const [a, b] = [fract(u), fract(v)];
  const edge = min(min(a, a.oneMinus()), min(b, b.oneMinus()));
  // Faces that look up or down (sills, soffits inside the reveal) stay plain.
  const lead = smoothstep(0.045, 0.02, edge).mul(smoothstep(0.6, 0.4, abs(normalGeometry.y)));
  // One value per quarry, from its integer cell: which piece of glass this is.
  const piece = fract(sin(floor(u).mul(12.9898).add(floor(v).mul(78.233))).mul(43758.5453));
  return { lead, piece };
}

/**
 * Glaze a workshop window recess: leaded glass, faintly lit by day as the kit
 * towns' are, glowing warm with `dusk` where `home` (0..1) says someone is in.
 * Shared by settlements (per-instance `home`) and the workshop and its baked
 * houses (always home), so a window looks the same everywhere.
 *
 * @param {object} recess the workshop's `recess` material
 * @param {{ dusk: import('three/tsl').Node, home: import('three/tsl').Node }} light
 */
export function glazeWindowRecess(recess, { dusk, home }) {
  const { lead, piece } = quarries();
  const pane = mix(PANE, PANE_GREEN, piece.mul(piece)).mul(piece.mul(0.5).add(0.75));
  recess.colorNode = mix(pane, LEAD, lead);
  recess.roughnessNode = mix(piece.mul(0.12).add(0.06), uniform(0.7), lead);
  recess.metalnessNode = mix(uniform(0.12), uniform(0.3), lead);
  const glass = lead.oneMinus().mul(piece.mul(0.6).add(0.7));
  recess.emissiveNode = mix(PANE_DAY_GLOW, WINDOW_GLOW.mul(1.15), dusk.mul(home)).mul(glass);
}
