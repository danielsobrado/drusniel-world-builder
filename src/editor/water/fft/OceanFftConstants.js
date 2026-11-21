import { SEA_SWELL_COMPONENTS } from '../SeaSwell.js';

/**
 * Constants for the offshore FFT sea (PR I). No runtime state.
 *
 * Units: metres, m/s (wind), rad/m (wave number k), rad/s (angular frequency ω),
 * seconds (water clock). Axes: Drusniel canonical X/Z, height +Y. Wind direction
 * is the heading the wind blows toward, radians from +X toward +Z; waves travel
 * downwind. Complex arrays are interleaved [re, im] per mode, row-major
 * index = q·N + p for kx index p and kz index q.
 *
 * Band cut-offs and cascades are provisional until the Phase I.0 baseline
 * confirms them; every function takes them as parameters with these defaults.
 */

export const GRAVITY = 9.81;
export const TAU = Math.PI * 2;

/** The analytic swell carriers own every wavelength at or above their shortest one. */
export const CARRIER_MIN_WAVELENGTH = Math.min(...SEA_SWELL_COMPONENTS.map((wave) => wave.wavelength));

/**
 * The carriers and ripples run at this fraction of deep-water phase speed
 * (SeaSwell's PHASE_SPEED_SCALE, read back from its components so it is never
 * duplicated). FFT evolution uses it so short waves do not outrun the swell (I.0 Decision A).
 */
export const CARRIER_PHASE_SPEED_SCALE = SEA_SWELL_COMPONENTS[0].angularSpeed
  / Math.sqrt(GRAVITY * SEA_SWELL_COMPONENTS[0].waveNumber);

/**
 * Evolution repeats exactly every T seconds: ω is quantised to whole cycles per
 * T, so the GPU can take τ = (t mod T)/T from a double-precision CPU clock and
 * keep float32 phase error below 1e-4 cycle (I.0 Decision E).
 */
export const WAVE_REPEAT_PERIOD_SECONDS = 512;

/** Provisional high-pass: zero weight at cutoffWavelength, full at fullWavelength (shorter). */
export const DEFAULT_HIGH_PASS = Object.freeze({
  cutoffWavelength: CARRIER_MIN_WAVELENGTH,
  fullWavelength: 5.5,
});

/** JONSWAP peak enhancement and spectral width either side of the peak (Hasselmann 1973). */
export const JONSWAP_GAMMA = 3.3;
export const JONSWAP_SIGMA_LOW = 0.07;
export const JONSWAP_SIGMA_HIGH = 0.09;
/** Fetch-limited JONSWAP fit (Hasselmann 1973, as in Horvath 2015): α and ω_p from U and fetch. */
export const JONSWAP_ALPHA = Object.freeze({ scale: 0.076, exponent: 0.22 });
export const JONSWAP_PEAK = Object.freeze({ scale: 22, exponent: 1 / 3 });
/** Donelan–Banner spreading clamps ω/ω_p below this ratio. */
export const DONELAN_BANNER_MIN_RATIO = 0.56;
/** Tessendorf small-wave suppression length l in exp(-(k·l)²), metres. */
export const SHORT_WAVE_FADE_LENGTH = 0.02;
/** Cox–Munk clean-sea total mean-square slope a + b·U. A reference prior, not a target. */
export const COX_MUNK_SLOPE = Object.freeze({ a: 0.003, b: 0.00512 });

/** Below this wind the spectrum is exactly zero (documented calm policy). */
export const CALM_WIND_SPEED = 1e-3;
/** Above this k·d, finite-depth terms equal deep water to double precision. */
export const DEEP_KD = 20;
/** Frequencies below this carry no energy (ω⁻⁵ would overflow). */
export const MIN_OMEGA = 1e-6;
/** Box–Muller lower bound on u1 so ln(u1) stays finite. */
export const MIN_UNIFORM = 1e-9;

export const LIMITS = Object.freeze({
  windSpeed: [0, 60],
  windDirection: [-1e6, 1e6],
  fetchMeters: [1, 1e8],
  depthMeters: [1e-3, 1e5],
  gamma: [1, 10],
  tileSizeMeters: [1e-3, 1e5],
  timeSeconds: [-1e9, 1e9],
  fftSize: [4, 512],
});

/**
 * Provisional cascades: half-open |k| bands [kMin, kMax) on their own tile
 * lattice. Contiguous from the high-pass cut-off; each ends below its own
 * Nyquist π·N/L at N=64. Final tile sizes belong to I.3.
 */
export const CASCADE_CANDIDATES = Object.freeze([
  Object.freeze({ tileSizeMeters: 48, kMin: TAU / CARRIER_MIN_WAVELENGTH, kMax: TAU / 2 }),
  Object.freeze({ tileSizeMeters: 12, kMin: TAU / 2, kMax: TAU / 0.5 }),
]);
