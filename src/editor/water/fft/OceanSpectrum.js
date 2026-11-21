import { hashString, createSeededRng } from '../../../sim/util/seededRng.js';
import {
  COX_MUNK_SLOPE, DEEP_KD, GRAVITY, HIGH_PASS_K0, HIGH_PASS_K1, JONSWAP_GAMMA,
  JONSWAP_SIGMA_HIGH, JONSWAP_SIGMA_LOW, SHORT_WAVE_FADE_LENGTH, TAU, WIND_SPEED_MAX,
} from './OceanFftConstants.js';

/**
 * Pure CPU model of the offshore wind-sea short band (PR I §4): TMA-corrected
 * JONSWAP with Donelan–Banner spreading, high-passed so it carries no energy at
 * the analytic swell carriers' wavelengths. The long swell stays analytic
 * (SeaSwell, normalised units × amplitude); this module is only the local wind
 * sea, in metres.
 *
 * Fourier convention: field(x) = Σ_k h(k,t)·exp(+i k·x) (no 1/N², see
 * OceanFourierReference.synthesize2d) with
 *   h(k,t) = h0(k)·exp(-iωt) + conj(h0(-k))·exp(+iωt)
 * so a mode travels toward +k, i.e. downwind. Ponlai's exp(+iωt) runs against k.
 * Wind direction is the heading the wind blows toward, radians from +X toward +Z.
 */

const MIN_OMEGA = 1e-6;
const MIN_WIND = 1e-3;

function assertFinite(value, name, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`ocean spectrum: ${name} must be a finite number in [${min}, ${max}], got ${value}.`);
  }
}

/** Validate inputs and derive fetch-limited JONSWAP terms (Hasselmann et al. 1973). */
export function resolveOceanSpectrumParams({
  windSpeed, windDirection, fetchMeters, depthMeters = Infinity, gamma = JONSWAP_GAMMA,
} = {}) {
  assertFinite(windSpeed, 'windSpeed (m/s)', 0, WIND_SPEED_MAX);
  assertFinite(windDirection, 'windDirection (rad)', -1e6, 1e6);
  assertFinite(fetchMeters, 'fetchMeters', 1, 1e8);
  if (!(depthMeters === Infinity || (Number.isFinite(depthMeters) && depthMeters > 0))) {
    throw new Error(`ocean spectrum: depthMeters must be positive or Infinity, got ${depthMeters}.`);
  }
  assertFinite(gamma, 'gamma', 1, 10);
  const calm = windSpeed < MIN_WIND;
  return Object.freeze({
    windSpeed, windDirection, fetchMeters, depthMeters, gamma, calm,
    alpha: calm ? 0 : 0.076 * ((windSpeed * windSpeed) / (fetchMeters * GRAVITY)) ** 0.22,
    omegaPeak: calm ? Infinity : 22 * ((GRAVITY * GRAVITY) / (windSpeed * fetchMeters)) ** (1 / 3),
  });
}

/** Finite-depth dispersion ω(k,d) = sqrt(g·k·tanh(k·d)) and its derivative dω/dk. */
export function dispersion(k, depthMeters = Infinity) {
  if (!(k > 0)) return { omega: 0, dOmegaDk: 0 };
  const kd = k * depthMeters;
  const deep = kd > DEEP_KD;
  const t = deep ? 1 : Math.tanh(kd);
  const omega = Math.sqrt(GRAVITY * k * t);
  const shallowTerm = deep ? 0 : kd / Math.cosh(kd) ** 2;
  return { omega, dOmegaDk: (GRAVITY * (t + shallowTerm)) / (2 * omega) };
}

export function jonswap(omega, { alpha, omegaPeak, gamma }) {
  if (!(omega > MIN_OMEGA) || alpha === 0) return 0;
  const sigma = omega <= omegaPeak ? JONSWAP_SIGMA_LOW : JONSWAP_SIGMA_HIGH;
  const r = Math.exp(-((omega - omegaPeak) ** 2) / (2 * sigma * sigma * omegaPeak * omegaPeak));
  return (alpha * GRAVITY * GRAVITY / omega ** 5) * Math.exp(-1.25 * (omegaPeak / omega) ** 4) * gamma ** r;
}

/** Kitaigorodskii depth attenuation Φ(ω_h), ω_h = ω·sqrt(d/g); 1 in deep water. */
export function tmaCorrection(omega, depthMeters) {
  if (depthMeters === Infinity) return 1;
  const wh = omega * Math.sqrt(depthMeters / GRAVITY);
  if (wh <= 1) return 0.5 * wh * wh;
  if (wh < 2) return 1 - 0.5 * (2 - wh) ** 2;
  return 1;
}

/** Donelan–Banner sech² spreading, normalised over θ ∈ [-π, π]. */
export function directionalSpread(theta, omegaRatio) {
  const r = Math.max(omegaRatio, 0.56);
  const beta = r < 0.95 ? 2.61 * r ** 1.3
    : r < 1.6 ? 2.28 * r ** -0.65
      : 10 ** (-0.4 + 0.8393 * Math.exp(-0.567 * Math.log(r * r)));
  const sech = 1 / Math.cosh(beta * theta);
  return (beta / (2 * Math.tanh(beta * Math.PI))) * sech * sech;
}

function wrapAngle(angle) {
  const wrapped = (angle + Math.PI) % TAU;
  return (wrapped < 0 ? wrapped + TAU : wrapped) - Math.PI;
}

/** smoothstep(k0, k1, k): exactly zero at and below the carrier knee. */
export function highPass(k) {
  if (k <= HIGH_PASS_K0) return 0;
  if (k >= HIGH_PASS_K1) return 1;
  const x = (k - HIGH_PASS_K0) / (HIGH_PASS_K1 - HIGH_PASS_K0);
  return x * x * (3 - 2 * x);
}

/** Half-open |k| band, so adjacent cascades never share a mode. */
export function inBand(k, { kMin, kMax }) {
  return k >= kMin && k < kMax;
}

/** Residual 2D wave-number power density P(kx,kz) in m⁴ (height variance per (rad/m)²). */
export function spectrumDensity(kx, kz, params) {
  const k = Math.hypot(kx, kz);
  const pass = highPass(k);
  if (pass === 0 || params.calm) return 0;
  const { omega, dOmegaDk } = dispersion(k, params.depthMeters);
  const s = jonswap(omega, params) * tmaCorrection(omega, params.depthMeters);
  if (s === 0) return 0;
  const spread = directionalSpread(wrapAngle(Math.atan2(kz, kx) - params.windDirection), omega / params.omegaPeak);
  const fade = Math.exp(-((k * SHORT_WAVE_FADE_LENGTH) ** 2));
  return (s * spread * dOmegaDk / k) * fade * pass;
}

export function signedIndex(i, n) {
  return i < n / 2 ? i : i - n;
}

function assertGrid(size, tileSizeMeters) {
  if (!Number.isInteger(size) || size < 4 || (size & (size - 1)) !== 0 || size > 512) {
    throw new Error(`ocean spectrum: size must be a power of two in [4, 512], got ${size}.`);
  }
  assertFinite(tileSizeMeters, 'tileSizeMeters', 1e-3, 1e5);
}

/**
 * Seeded h0 table for one cascade. Each mode's Gaussian pair is hashed from
 * (seed, cascade, signed kx index, signed kz index), so it depends neither on
 * scan order nor on N. DC and both Nyquist lines are zero: Nyquist cells are
 * their own mirror, so i·k·h there could not stay Hermitian.
 */
export function createModeTable({ seed, size, tileSizeMeters, band, params, cascadeIndex = 0 }) {
  if (!Number.isSafeInteger(seed)) throw new Error(`ocean spectrum: seed must be a safe integer, got ${seed}.`);
  assertGrid(size, tileSizeMeters);
  const count = size * size;
  const deltaK = TAU / tileSizeMeters;
  const table = {
    size, tileSizeMeters, deltaK, band, seed, cascadeIndex,
    kx: new Float64Array(count), kz: new Float64Array(count), omega: new Float64Array(count),
    power: new Float64Array(count), h0Re: new Float64Array(count), h0Im: new Float64Array(count),
  };
  const half = size / 2;
  for (let q = 0; q < size; q++) {
    for (let p = 0; p < size; p++) {
      const index = q * size + p;
      const sp = signedIndex(p, size), sq = signedIndex(q, size);
      const kx = sp * deltaK, kz = sq * deltaK, k = Math.hypot(kx, kz);
      table.kx[index] = kx;
      table.kz[index] = kz;
      table.omega[index] = dispersion(k, params.depthMeters).omega;
      if (p === half || q === half || k === 0 || !inBand(k, band)) continue;
      const power = spectrumDensity(kx, kz, params) * deltaK * deltaK;
      if (power === 0) continue;
      const rng = createSeededRng(hashString(`ocean-fft:${seed}:${cascadeIndex}:${sp}:${sq}`));
      const u1 = Math.max(rng.nextFloat(), 1e-9), u2 = rng.nextFloat();
      const radius = Math.sqrt(-2 * Math.log(u1));
      // E|h0|² = power/2; the conj(h0(-k)) partner supplies the other half of the real field's variance.
      const amplitude = Math.sqrt(power) / 2;
      table.power[index] = power;
      table.h0Re[index] = radius * Math.cos(TAU * u2) * amplitude;
      table.h0Im[index] = radius * Math.sin(TAU * u2) * amplitude;
    }
  }
  return table;
}

/**
 * h(k,t) and its slopes i·kx·h, i·kz·h at absolute time t. Phase is ω·t
 * reduced mod 2π in double precision, so seeks and large clocks repeat exactly.
 */
export function evolveModes(table, timeSeconds) {
  assertFinite(timeSeconds, 'timeSeconds', -1e9, 1e9);
  const { size, h0Re, h0Im, kx, kz, omega } = table;
  const count = size * size;
  const out = {
    heightRe: new Float64Array(count), heightIm: new Float64Array(count),
    slopeXRe: new Float64Array(count), slopeXIm: new Float64Array(count),
    slopeZRe: new Float64Array(count), slopeZIm: new Float64Array(count),
  };
  for (let q = 0; q < size; q++) {
    for (let p = 0; p < size; p++) {
      const index = q * size + p;
      const mirror = ((size - q) % size) * size + ((size - p) % size);
      const phase = (omega[index] * timeSeconds) % TAU;
      const c = Math.cos(phase), s = Math.sin(phase);
      // h0(k)·e^{-iφ} + conj(h0(-k))·e^{+iφ}; ω(k) = ω(-k)
      const re = h0Re[index] * c + h0Im[index] * s + h0Re[mirror] * c + h0Im[mirror] * s;
      const im = h0Im[index] * c - h0Re[index] * s - h0Im[mirror] * c + h0Re[mirror] * s;
      out.heightRe[index] = re;
      out.heightIm[index] = im;
      out.slopeXRe[index] = -kx[index] * im;
      out.slopeXIm[index] = kx[index] * re;
      out.slopeZRe[index] = -kz[index] * im;
      out.slopeZIm[index] = kz[index] * re;
    }
  }
  return out;
}

/** Expected height variance (m²) and mean-square slope E[sx²+sz²] of a table's realisations. */
export function expectedVariance(table) {
  let height = 0, slope = 0;
  for (let i = 0; i < table.power.length; i++) {
    height += table.power[i];
    slope += table.power[i] * (table.kx[i] ** 2 + table.kz[i] ** 2);
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
