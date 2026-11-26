/**
 * The one outline every ecological footprint shares (WSC PR 6): the grass a
 * trunk clears (meadow/MeadowGroundSample.js) and the duff and litter painted
 * under it (contactShade.js) are the same lobed shape at the same phase, so the
 * shade never sits as a ruled disc under a lobed grass gap (`DEF-09`).
 *
 * Pure and dependency-free: the meadow sampler runs it on worker threads too.
 */

/** How far a footprint's three lobes push in and out of its circle. */
export const ROOT_LOBE = 0.22;

/** Deterministic per-placement phase in [0, 2π), keyed on canonical position. */
export function footprintPhase(x, z) {
  return (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453 % 1) * Math.PI * 2;
}

/**
 * Radial scale of the outline toward world offset `(dx, dz)` from its centre:
 * divide a distance by it to read the lobed footprint as a unit circle.
 */
export function footprintLobe(dx, dz, phase) {
  return footprintLobeAt(dx, dz, Math.cos(phase), Math.sin(phase));
}

/**
 * `footprintLobe` with the phase's cosine and sine precomputed, trig-free for
 * per-texel loops: cos(3θ + φ) from the direction's cos θ and sin θ.
 */
export function footprintLobeAt(dx, dz, cosPhase, sinPhase) {
  const length = Math.hypot(dx, dz);
  if (length < 1e-9) return 1 + ROOT_LOBE * cosPhase;
  const c = dx / length;
  const s = dz / length;
  const cos3 = c * (4 * c * c - 3);
  const sin3 = s * (3 - 4 * s * s);
  return 1 + ROOT_LOBE * (cos3 * cosPhase - sin3 * sinPhase);
}
