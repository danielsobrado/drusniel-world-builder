import { CARRIER_PHASE_SPEED_SCALE, GRAVITY, OFFSHORE_FFT_SEED, TAU } from './fft/OceanFftConstants.js';
import { modeHash, seedWords } from './fft/OceanGaussianModes.js';
import { angularFrequency, directionalSpread, jonswap, resolveOceanSpectrumParams, wrapAngle } from './fft/OceanSpectrum.js';
import { SEA_SWELL_COMPONENTS } from './SeaSwell.js';

/**
 * Wind-driven long swell as wave geometry (PR I phase I.6, Strategy A of plan §6.6).
 *
 * A small fixed set of deterministic Fourier modes in a band no other wave owns:
 * longer than the longest authored carrier (42 m), up to 160 m. Every mode's
 * wave number, direction and phase are seeded constants, so the field never swims;
 * the weather only sets amplitudes, from the same JONSWAP spectrum and wind as the
 * FFT normals (I.5). The CPU (`sampleOceanSwellCpu`) and the shader read the same
 * amplitudes and time phases each frame, so gameplay rides the drawn surface with
 * no GPU readback. O(K) per query, K = 16.
 */

export const OCEAN_SWELL_BAND = Object.freeze({ minWavelength: 48, maxWavelength: 160 });
export const OCEAN_SWELL_BINS = 4;
export const OCEAN_SWELL_DIRECTIONS = 4;
export const OCEAN_SWELL_MODE_COUNT = OCEAN_SWELL_BINS * OCEAN_SWELL_DIRECTIONS;
/** Midpoint quadrature per bin: the integrand is smooth, 16 points keep the energy within 0.2 % (test). */
const BIN_QUADRATURE = 16;
const FETCH_METERS = 50_000;
const HASH_DOMAIN = 0x5357; // 'SW': keeps these hashes apart from the FFT's cascade modes

if (OCEAN_SWELL_BAND.minWavelength <= Math.max(...SEA_SWELL_COMPONENTS.map((w) => w.wavelength))) {
  throw new Error('ocean swell: the band must lie beyond the authored carriers.');
}

const unit = (hash) => hash / 2 ** 32;

/**
 * The fixed mode set: per log-spaced bin, a seeded wavelength inside it; per
 * direction, 90° apart from a seeded rotation; a seeded phase each. Deterministic.
 */
export function createOceanSwellModes(seed = OFFSHORE_FFT_SEED) {
  const [lo, hi] = seedWords(seed);
  const { minWavelength, maxWavelength } = OCEAN_SWELL_BAND;
  const ratio = (maxWavelength / minWavelength) ** (1 / OCEAN_SWELL_BINS);
  const modes = [];
  for (let bin = 0; bin < OCEAN_SWELL_BINS; bin++) {
    const longest = maxWavelength / ratio ** bin, shortest = longest / ratio;
    const pick = unit(modeHash(lo, hi, HASH_DOMAIN, bin, 0));
    const wavelength = shortest * ratio ** (0.25 + 0.5 * pick);
    const rotation = unit(modeHash(lo, hi, HASH_DOMAIN, bin, 1)) * TAU;
    const k = TAU / wavelength;
    for (let d = 0; d < OCEAN_SWELL_DIRECTIONS; d++) {
      const direction = rotation + (d * TAU) / OCEAN_SWELL_DIRECTIONS;
      modes.push(Object.freeze({
        bin, wavelength, waveNumber: k, direction,
        x: Math.cos(direction), z: Math.sin(direction),
        phase: unit(modeHash(lo, hi, HASH_DOMAIN, bin, 2 + d)) * TAU,
        // The carriers' slowed phase speed (SeaSwell), so both swells keep one tempo.
        angularSpeed: Math.sqrt(GRAVITY * k) * CARRIER_PHASE_SPEED_SCALE,
        bandK: [TAU / longest, TAU / shortest],
      }));
    }
  }
  return Object.freeze(modes);
}

/** Height variance of a bin, ∫ S(ω) dω over its wave numbers (deep water). */
function binVariance(params, [k0, k1]) {
  const w0 = angularFrequency(k0), w1 = angularFrequency(k1), step = (w1 - w0) / BIN_QUADRATURE;
  let variance = 0;
  for (let i = 0; i < BIN_QUADRATURE; i++) variance += jonswap(w0 + (i + 0.5) * step, params) * step;
  return variance;
}

/**
 * Each mode's amplitude (m) for a wind `{ windSpeed, windDirection }`: the bin's
 * variance split over its directions by the spectrum's spreading, normalised so the
 * bin keeps its energy exactly; a sine of amplitude a carries a²/2. Upwind modes get ~0.
 */
export function oceanSwellAmplitudes(modes, { windSpeed, windDirection }, out = new Float64Array(modes.length)) {
  const params = resolveOceanSpectrumParams({ windSpeed, windDirection, fetchMeters: FETCH_METERS });
  for (let start = 0; start < modes.length; start += OCEAN_SWELL_DIRECTIONS) {
    const variance = params.calm ? 0 : binVariance(params, modes[start].bandK);
    const omegaRatio = angularFrequency(modes[start].waveNumber) / params.omegaPeak;
    let total = 0;
    for (let d = 0; d < OCEAN_SWELL_DIRECTIONS; d++) {
      out[start + d] = directionalSpread(wrapAngle(modes[start + d].direction - windDirection), omegaRatio);
      total += out[start + d];
    }
    for (let d = 0; d < OCEAN_SWELL_DIRECTIONS; d++) {
      out[start + d] = total > 0 ? Math.sqrt(2 * variance * (out[start + d] / total)) : 0;
    }
  }
  return out;
}

/** Largest possible Σ|a| for winds up to `windSpeed` (any heading): bounds and culling headroom. */
export function oceanSwellAmplitudeBound(modes, windSpeed) {
  const params = resolveOceanSpectrumParams({ windSpeed, windDirection: 0, fetchMeters: FETCH_METERS });
  let bound = 0;
  // Cauchy–Schwarz over each bin's directions: Σ√(2V·w) ≤ √(2V·D) with Σw = 1.
  for (let start = 0; start < modes.length; start += OCEAN_SWELL_DIRECTIONS) {
    bound += Math.sqrt(2 * binVariance(params, modes[start].bandK) * OCEAN_SWELL_DIRECTIONS);
  }
  return bound;
}

const wrap = (value) => { const r = value % TAU; return r < 0 ? r + TAU : r; };

/** Mode phase at canonical (x, z), time excluded, wrapped in double precision (per-chunk origins). */
export function oceanSwellSpatialPhase(mode, x, z) {
  return wrap((x * mode.x + z * mode.z) * mode.waveNumber + mode.phase);
}

/** Mode time phase ω·t, wrapped in double precision; waves travel toward their direction. */
export const oceanSwellTimePhase = (mode, timeSeconds) => wrap(timeSeconds * mode.angularSpeed);

/**
 * Height (m) and slope (∂h/∂x, ∂h/∂z) at canonical (x, z) for the given amplitudes and
 * absolute water time: the shader's twin. `out` = [height, slopeX, slopeZ].
 */
export function sampleOceanSwellCpu(modes, amplitudes, x, z, timeSeconds, out = [0, 0, 0]) {
  let height = 0, sx = 0, sz = 0;
  for (let i = 0; i < modes.length; i++) {
    const a = amplitudes[i];
    if (a === 0) continue;
    const mode = modes[i];
    const phase = oceanSwellSpatialPhase(mode, x, z) - oceanSwellTimePhase(mode, timeSeconds);
    height += a * Math.sin(phase);
    const d = a * mode.waveNumber * Math.cos(phase);
    sx += d * mode.x;
    sz += d * mode.z;
  }
  out[0] = height; out[1] = sx; out[2] = sz;
  return out;
}
