/**
 * The one outline every ecological footprint shares (WSC PR 6): the grass a
 * trunk clears (meadow/MeadowGroundSample.js) and the duff and litter painted
 * under it (contactShade.js) are the same irregular shape at the same phase, so
 * the shade never sits as a ruled disc under a lobed grass gap (`DEF-09`).
 *
 * The outline is a per-placement mix of the 1st (off-centre), 2nd (elongation),
 * 3rd and 5th radial harmonics, each with its own hashed amplitude and phase.
 * A single harmonic gives every patch the same rounded polygon, which reads as
 * a stamp from above; the mix gives each one its own blob.
 *
 * Pure and dependency-free: the meadow sampler runs it on worker threads too.
 */

/** Harmonic orders and their maximum amplitudes; the amplitudes sum to `ROOT_LOBE`. */
const HARMONICS = Object.freeze([[1, 0.08], [2, 0.13], [3, 0.08], [5, 0.05]]);

/** The furthest any footprint pushes in or out of its circle (sum of the amplitudes). */
export const ROOT_LOBE = HARMONICS.reduce((sum, [, amplitude]) => sum + amplitude, 0);

const fract = value => value - Math.floor(value);

/** Deterministic per-placement phase in [0, 2π), keyed on canonical position. */
export function footprintPhase(x, z) {
  return (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453 % 1) * Math.PI * 2;
}

/**
 * The outline a phase stands for: per-harmonic cosine and sine coefficients
 * `[A1, B1, A2, B2, A3, B3, A5, B5]`, so that the radial scale toward angle θ is
 * `1 + Σ (A_k cos kθ − B_k sin kθ)`. Compute once per placement, not per texel.
 */
export function footprintShape(phase) {
  const u = phase / (Math.PI * 2);
  const shape = new Float64Array(HARMONICS.length * 2);
  HARMONICS.forEach(([order, maxAmplitude], i) => {
    const amplitude = maxAmplitude * (0.45 + 0.55 * fract(u * (97.31 + 41.7 * order)));
    const angle = Math.PI * 2 * fract(u * (13.17 + 7.93 * order) + 0.618 * order);
    shape[i * 2] = amplitude * Math.cos(angle);
    shape[i * 2 + 1] = amplitude * Math.sin(angle);
  });
  return shape;
}

/**
 * Radial scale of the outline toward world offset `(dx, dz)` from its centre:
 * divide a distance by it to read the footprint as a unit circle.
 */
export function footprintLobe(dx, dz, phase) {
  return footprintLobeAt(dx, dz, footprintShape(phase));
}

/** `footprintLobe` for a precomputed `footprintShape`, trig-free for per-texel loops. */
export function footprintLobeAt(dx, dz, shape) {
  const length = Math.hypot(dx, dz);
  if (length < 1e-9) return 1;
  const c = dx / length;
  const s = dz / length;
  const c2 = c * c - s * s;
  const s2 = 2 * c * s;
  const c3 = c * c2 - s * s2;
  const s3 = s * c2 + c * s2;
  const c5 = c2 * c3 - s2 * s3;
  const s5 = s2 * c3 + c2 * s3;
  return 1
    + shape[0] * c - shape[1] * s
    + shape[2] * c2 - shape[3] * s2
    + shape[4] * c3 - shape[5] * s3
    + shape[6] * c5 - shape[7] * s5;
}
