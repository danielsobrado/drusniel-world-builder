import { abs, attribute, color, floor, fract, min, mix, normalGeometry, positionGeometry, sin, smoothstep, step, uniform, vec3 } from 'three/tsl';

/**
 * How far into evening the world is, 0 in full day to 1 at night, as one
 * uniform every settlement material reads. Towns light up with it: windows and
 * lantern glass are emissive materials, not lights — a town is hundreds of
 * them, and a real light apiece would not scale.
 */
export const settlementDusk = uniform(0);

function smooth(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Dusk from the sky as it is drawn: the sun low on the horizon, or the key
 * light dimmed (a moonlit look keeps its "sun" high and turns it down).
 *
 * @param {?{ sunDirectionValue?: { y: number }, directional?: { intensity: number } }} skyView
 */
export function duskFromSky(skyView) {
  if (!skyView) return 0;
  const low = 1 - smooth(0.04, 0.3, skyView.sunDirectionValue?.y ?? 1);
  const dim = 1 - smooth(0.15, 0.7, skyView.directional?.intensity ?? 1);
  return Math.max(low, dim);
}

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

const LANTERN_GLOW = color('#ffae45');

/**
 * Light the workshop's emissive families from the dusk uniform. Window recesses
 * are leaded glass, faintly lit by day as the kit towns' are, and glow warm in
 * the evening — in most houses, not all: each instance's stable seed decides
 * whether anyone is home — and lantern glass, a faint ember by day, burns at
 * night.
 */
export function lightSettlementMaterials(materials) {
  if (materials.recess) {
    // The dithered instance material packs a stable per-instance seed in `instanceDither.y`.
    const home = step(0.3, fract(attribute('instanceDither', 'vec3').y.mul(7.31)));
    const { lead, piece } = quarries();
    const pane = mix(PANE, PANE_GREEN, piece.mul(piece)).mul(piece.mul(0.5).add(0.75));
    materials.recess.colorNode = mix(pane, LEAD, lead);
    materials.recess.roughnessNode = mix(piece.mul(0.12).add(0.06), uniform(0.7), lead);
    materials.recess.metalnessNode = mix(uniform(0.12), uniform(0.3), lead);
    const glass = lead.oneMinus().mul(piece.mul(0.6).add(0.7));
    materials.recess.emissiveNode = mix(PANE_DAY_GLOW, WINDOW_GLOW.mul(1.15), settlementDusk.mul(home)).mul(glass);
  }
  if (materials.glow) materials.glow.emissiveNode = LANTERN_GLOW.mul(settlementDusk.mul(2.4).add(0.35));
}
