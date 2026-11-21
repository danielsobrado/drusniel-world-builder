import { SEA_SWELL_COMPONENTS } from '../SeaSwell.js';

/**
 * Spectral units and band constants for the offshore FFT sea (PR I).
 * SI throughout: metres, m/s, rad/m (wave number), rad/s (angular frequency).
 * Prototype values only — shipped tuning belongs to the approved quality profile.
 */

export const GRAVITY = 9.81;
export const TAU = Math.PI * 2;

/** The analytic swell carriers own every wavelength at or above their shortest one. */
export const CARRIER_MIN_WAVELENGTH = Math.min(...SEA_SWELL_COMPONENTS.map((wave) => wave.wavelength));
/** High-pass knee: zero FFT energy at k0, full at k1 (strictly on the short side of the carriers). */
export const HIGH_PASS_K0 = TAU / CARRIER_MIN_WAVELENGTH;
export const HIGH_PASS_K1 = TAU / 5.5;

/** JONSWAP peak enhancement and width either side of the peak (Hasselmann 1973). */
export const JONSWAP_GAMMA = 3.3;
export const JONSWAP_SIGMA_LOW = 0.07;
export const JONSWAP_SIGMA_HIGH = 0.09;
/** Tessendorf small-wave suppression length: exp(-(k·l)²). */
export const SHORT_WAVE_FADE_LENGTH = 0.02;
/** Cox–Munk clean-sea mean-square slope prior: a + b·U. Reference only, not a target. */
export const COX_MUNK_SLOPE = Object.freeze({ a: 0.003, b: 0.00512 });

/** Above this k·d the finite-depth terms equal deep water to double precision. */
export const DEEP_KD = 20;
export const WIND_SPEED_MAX = 60;

/**
 * Candidate cascades: disjoint |k| bands [kMin, kMax) on their own tile lattice.
 * The first starts at the carrier knee; each ends below its own Nyquist at N=64.
 * Tile sizes are settled in I.3 from short-wave limits, not taken from Ponlai.
 */
export const CASCADE_CANDIDATES = Object.freeze([
  Object.freeze({ tileSizeMeters: 48, kMin: HIGH_PASS_K0, kMax: TAU / 2 }),
  Object.freeze({ tileSizeMeters: 12, kMin: TAU / 2, kMax: TAU / 0.5 }),
]);
