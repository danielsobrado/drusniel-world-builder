import {
  CALM_WIND_SPEED, CARRIER_PHASE_SPEED_SCALE, COX_MUNK_SLOPE, WAVE_REPEAT_PERIOD_SECONDS, DEEP_KD, DEFAULT_HIGH_PASS, DONELAN_BANNER_MIN_RATIO, GRAVITY,
  JONSWAP_ALPHA, JONSWAP_GAMMA, JONSWAP_PEAK, JONSWAP_SIGMA_HIGH, JONSWAP_SIGMA_LOW, LIMITS,
  MIN_OMEGA, SHORT_WAVE_FADE_LENGTH, TAU,
} from './OceanFftConstants.js';

/**
 * Pure directional wind-sea spectrum for the offshore FFT residual (PR I §4).
 * TMA-corrected JONSWAP × Donelan–Banner spreading, converted to a 2D
 * wave-number density and high-passed so the analytic swell carriers keep every
 * wavelength they own. Formulas are from the published literature (Hasselmann
 * 1973, Bouws 1985 / Kitaigorodskii, Donelan 1985, Tessendorf 2001); Ponlai's
 * OceanSpectrum.ts (MIT, after tidewater) was a reference, no code is copied.
 *
 * Only the local wind sea lives here, in metres. The long swell stays analytic
 * (SeaSwell: normalised units × amplitude).
 */

export function assertInRange(value, name, [min, max]) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`ocean fft: ${name} must be a finite number in [${min}, ${max}], got ${value}.`);
  }
}

export const waveNumberFromWavelength = (wavelengthMeters) => TAU / wavelengthMeters;
export const wavelengthFromWaveNumber = (k) => TAU / k;

/** Fourier index i ∈ [0, N) → signed frequency index in [-N/2, N/2). */
export function signedIndex(i, n) {
  return i < n / 2 ? i : i - n;
}

/** Flat index of the mode at −k: the conjugate partner for a real field. */
export function mirrorIndex(index, n) {
  const p = index % n, q = (index - p) / n;
  return ((n - q) % n) * n + ((n - p) % n);
}

/**
 * Validated wind-sea parameters with derived fetch-limited JONSWAP terms.
 * Calm policy: windSpeed below CALM_WIND_SPEED gives an exactly zero spectrum.
 */
export function resolveOceanSpectrumParams({
  windSpeed, windDirection, fetchMeters, depthMeters = Infinity, gamma = JONSWAP_GAMMA,
} = {}) {
  assertInRange(windSpeed, 'windSpeed (m/s)', LIMITS.windSpeed);
  assertInRange(windDirection, 'windDirection (rad)', LIMITS.windDirection);
  assertInRange(fetchMeters, 'fetchMeters', LIMITS.fetchMeters);
  if (depthMeters !== Infinity) assertInRange(depthMeters, 'depthMeters', LIMITS.depthMeters);
  assertInRange(gamma, 'gamma', LIMITS.gamma);
  const calm = windSpeed < CALM_WIND_SPEED;
  const g2 = GRAVITY * GRAVITY;
  return Object.freeze({
    windSpeed, windDirection, fetchMeters, depthMeters, gamma, calm,
    alpha: calm ? 0 : JONSWAP_ALPHA.scale * ((windSpeed * windSpeed) / (fetchMeters * GRAVITY)) ** JONSWAP_ALPHA.exponent,
    omegaPeak: calm ? Infinity : JONSWAP_PEAK.scale * (g2 / (windSpeed * fetchMeters)) ** JONSWAP_PEAK.exponent,
  });
}

/** Finite-depth dispersion ω = sqrt(g·k·tanh(k·d)); k ≤ 0 gives 0. */
export function angularFrequency(k, depthMeters = Infinity) {
  if (!(k > 0)) return 0;
  const kd = k * depthMeters;
  return Math.sqrt(GRAVITY * k * (kd > DEEP_KD ? 1 : Math.tanh(kd)));
}

/** dω/dk = g·(tanh(kd) + kd·sech²(kd)) / 2ω, the Jacobian from ω- to k-density. */
export function angularFrequencyDerivative(k, depthMeters = Infinity) {
  const omega = angularFrequency(k, depthMeters);
  if (omega === 0) return 0;
  const kd = k * depthMeters;
  const deep = kd > DEEP_KD;
  const tanhKd = deep ? 1 : Math.tanh(kd);
  const shallowTerm = deep ? 0 : kd / Math.cosh(kd) ** 2;
  return (GRAVITY * (tanhKd + shallowTerm)) / (2 * omega);
}

/** JONSWAP angular-frequency density S(ω), m²·s. */
export function jonswap(omega, { alpha, omegaPeak, gamma }) {
  if (!(omega > MIN_OMEGA) || alpha === 0) return 0;
  const sigma = omega <= omegaPeak ? JONSWAP_SIGMA_LOW : JONSWAP_SIGMA_HIGH;
  const r = Math.exp(-((omega - omegaPeak) ** 2) / (2 * sigma * sigma * omegaPeak * omegaPeak));
  return (alpha * GRAVITY * GRAVITY / omega ** 5) * Math.exp(-1.25 * (omegaPeak / omega) ** 4) * gamma ** r;
}

/** Kitaigorodskii depth attenuation Φ(ω_h), ω_h = ω·sqrt(d/g); 1 in deep water. */
export function tmaCorrection(omega, depthMeters = Infinity) {
  if (depthMeters === Infinity) return 1;
  const wh = omega * Math.sqrt(depthMeters / GRAVITY);
  if (wh <= 1) return 0.5 * wh * wh;
  if (wh < 2) return 1 - 0.5 * (2 - wh) ** 2;
  return 1;
}

/** Donelan–Banner sech² spreading D(θ), normalised to 1 over θ ∈ [-π, π]. */
export function directionalSpread(theta, omegaRatio) {
  const r = Math.max(omegaRatio, DONELAN_BANNER_MIN_RATIO);
  const beta = r < 0.95 ? 2.61 * r ** 1.3
    : r < 1.6 ? 2.28 * r ** -0.65
      : 10 ** (-0.4 + 0.8393 * Math.exp(-0.567 * Math.log(r * r)));
  const sech = 1 / Math.cosh(beta * theta);
  return (beta / (2 * Math.tanh(beta * Math.PI))) * sech * sech;
}

/** Angle wrapped to [-π, π). */
export function wrapAngle(angle) {
  const wrapped = (angle + Math.PI) % TAU;
  return (wrapped < 0 ? wrapped + TAU : wrapped) - Math.PI;
}

/** smoothstep weight in [0, 1]: exactly zero at and below the cut-off wave number. */
export function highPassWeight(k, { cutoffWavelength, fullWavelength } = DEFAULT_HIGH_PASS) {
  const k0 = TAU / cutoffWavelength, k1 = TAU / fullWavelength;
  if (!(k1 > k0)) throw new RangeError('ocean fft: high-pass fullWavelength must be shorter than cutoffWavelength.');
  if (k <= k0) return 0;
  if (k >= k1) return 1;
  const x = (k - k0) / (k1 - k0);
  return x * x * (3 - 2 * x);
}

/** Half-open |k| band [kMin, kMax): adjacent cascades never share a mode. */
export function cascadeBandWeight(k, { kMin, kMax }) {
  return k >= kMin && k < kMax ? 1 : 0;
}

/**
 * Residual 2D wave-number density P(kx, kz) in m⁴ (height variance per (rad/m)²):
 * S(ω)·TMA·D(θ)·(dω/dk)/k · shortWaveFade · highPass.
 */
export function spectrumDensity(kx, kz, params, highPass = DEFAULT_HIGH_PASS) {
  const k = Math.hypot(kx, kz);
  if (params.calm || k === 0) return 0;
  const pass = highPassWeight(k, highPass);
  if (pass === 0) return 0;
  const omega = angularFrequency(k, params.depthMeters);
  const s = jonswap(omega, params) * tmaCorrection(omega, params.depthMeters);
  if (s === 0) return 0;
  const theta = wrapAngle(Math.atan2(kz, kx) - params.windDirection);
  const fade = Math.exp(-((k * SHORT_WAVE_FADE_LENGTH) ** 2));
  return s * directionalSpread(theta, omega / params.omegaPeak)
    * angularFrequencyDerivative(k, params.depthMeters) / k * fade * pass;
}

/**
 * Per-mode expected height variance P·Δk² on one cascade lattice. DC and both
 * Nyquist lines are zero: a Nyquist cell is its own mirror, so i·k·h there
 * cannot stay Hermitian.
 */
export function createModePowerTable({ size, tileSizeMeters, band, params, highPass = DEFAULT_HIGH_PASS }) {
  assertFftSize(size);
  assertInRange(tileSizeMeters, 'tileSizeMeters', LIMITS.tileSizeMeters);
  const deltaK = TAU / tileSizeMeters;
  const power = new Float64Array(size * size);
  const half = size / 2;
  for (let q = 0; q < size; q++) {
    if (q === half) continue;
    const kz = signedIndex(q, size) * deltaK;
    for (let p = 0; p < size; p++) {
      if (p === half) continue;
      const kx = signedIndex(p, size) * deltaK;
      if (cascadeBandWeight(Math.hypot(kx, kz), band) === 0) continue;
      power[q * size + p] = spectrumDensity(kx, kz, params, highPass) * deltaK * deltaK;
    }
  }
  return { size, tileSizeMeters, deltaK, power };
}

/**
 * Per-mode evolution frequencies for one cascade lattice. ω is the finite-depth
 * dispersion scaled to the carriers' phase speed, then quantised to whole
 * `cycles` per repeat period so the sea loops exactly every periodSeconds.
 * Quantisation error is at most half a cycle per period (≤ 0.5 % at the 7.5 m knee).
 */
export function createWaveFrequencies(size, tileSizeMeters, {
  depthMeters = Infinity, phaseSpeedScale = CARRIER_PHASE_SPEED_SCALE, periodSeconds = WAVE_REPEAT_PERIOD_SECONDS,
} = {}) {
  assertFftSize(size);
  assertInRange(tileSizeMeters, 'tileSizeMeters', LIMITS.tileSizeMeters);
  assertInRange(phaseSpeedScale, 'phaseSpeedScale', [0, 10]);
  assertInRange(periodSeconds, 'periodSeconds', [1, 1e5]);
  const deltaK = TAU / tileSizeMeters;
  const cycles = new Float64Array(size * size);
  const omega = new Float64Array(size * size);
  for (let q = 0; q < size; q++) {
    for (let p = 0; p < size; p++) {
      const k = Math.hypot(signedIndex(p, size), signedIndex(q, size)) * deltaK;
      const whole = Math.round(angularFrequency(k, depthMeters) * phaseSpeedScale * periodSeconds / TAU);
      cycles[q * size + p] = whole;
      omega[q * size + p] = whole * TAU / periodSeconds;
    }
  }
  return { cycles, omega, periodSeconds };
}

export function assertFftSize(size) {
  const [min, max] = LIMITS.fftSize;
  if (!Number.isInteger(size) || size < min || size > max || (size & (size - 1)) !== 0) {
    throw new RangeError(`ocean fft: size must be a power of two in [${min}, ${max}], got ${size}.`);
  }
}

/** Expected height variance (m²) and total mean-square slope E[sx² + sz²] of a power table. */
export function expectedVariance({ size, deltaK, power }) {
  let height = 0, slope = 0;
  for (let q = 0; q < size; q++) {
    const kz = signedIndex(q, size) * deltaK;
    for (let p = 0; p < size; p++) {
      const kx = signedIndex(p, size) * deltaK;
      const value = power[q * size + p];
      height += value;
      slope += value * (kx * kx + kz * kz);
    }
  }
  return { height, slope };
}

/**
 * Analytic swell carriers' variance for comparison (sharpness 0): each
 * weighted sine of amplitude a·w/W contributes (a·w/W)²/2, slope ×k².
 */
export function carrierVariance(components, amplitudeMeters) {
  const weightSum = components.reduce((sum, wave) => sum + wave.weight, 0);
  let height = 0, slope = 0;
  for (const wave of components) {
    const a2 = (amplitudeMeters * wave.weight / weightSum) ** 2 / 2;
    height += a2;
    slope += a2 * wave.waveNumber * wave.waveNumber;
  }
  return { height, slope };
}

export function coxMunkSlopeVariance(windSpeed) {
  return COX_MUNK_SLOPE.a + COX_MUNK_SLOPE.b * windSpeed;
}
