import { createGaussianModes, createInitialSpectrum } from './OceanGaussianModes.js';
import { createModePowerTable, createWaveFrequencies, resolveOceanSpectrumParams } from './OceanSpectrum.js';
import { windChanged } from './OceanFftWeather.js';

/** Seconds between uploads while a transition runs: each step moves amplitudes by ≤ STEP/transition. */
export const SPECTRUM_STEP_SECONDS = 0.25;

/**
 * The FFT spectrum as weather changes (PR I phase I.5). CPU only; the controller uploads.
 *
 * - The seeded Gaussians and the dispersion cycles do not depend on wind: built once.
 * - A meaningful wind change (OceanFftWeather.windChanged) builds the new target one
 *   cascade per update (~1.3 ms each) instead of one 2.6 ms hitch.
 * - The transition interpolates each mode's power and keeps its phase: P = lerp(P₀, P₁, a),
 *   h0 = g·√P/2 with the same seeded g. The slope variance then moves linearly from one
 *   sea to the other (an amplitude lerp would dip to ¼ power on modes only one wind
 *   owns, a brief calm mid-turn), and nothing flashes, resets or rotates. `power` is the
 *   uploaded one, so the unresolved-variance table follows exactly.
 * - Fixed wind ⇒ exactly the spectrum `buildCascadeSpectra` gives for it.
 */
export class OceanFftSpectrumState {
  constructor({ size, cascades, seed, fetchMeters, transitionSeconds, wind }) {
    this.size = size;
    this.fetchMeters = fetchMeters;
    this.transitionSeconds = transitionSeconds;
    this.cascades = cascades.map(({ tileSizeMeters, kMin, kMax }, cascadeIndex) => ({
      tileSizeMeters, band: { kMin, kMax },
      gaussians: createGaussianModes({ seed, size, cascadeIndex }),
      cycles: createWaveFrequencies(size, tileSizeMeters, { depthMeters: Infinity }).cycles,
    }));
    this.wind = { ...wind };
    this.current = this.build(this.wind);
    this.from = null;
    this.to = null;
    this.progress = 1;
    this.sinceStep = 0;
    this.pending = null; // { wind, spectra: [] } while the target is being built
  }

  buildCascade(index, wind) {
    const cascade = this.cascades[index];
    const params = resolveOceanSpectrumParams({ ...wind, fetchMeters: this.fetchMeters });
    const table = createModePowerTable({ size: this.size, tileSizeMeters: cascade.tileSizeMeters, band: cascade.band, params });
    return {
      tileSizeMeters: cascade.tileSizeMeters, h0: createInitialSpectrum(cascade.gaussians, table),
      cycles: cascade.cycles, power: table.power, deltaK: table.deltaK,
    };
  }

  build(wind) {
    return this.cascades.map((_, index) => this.buildCascade(index, wind));
  }

  get transitioning() {
    return this.progress < 1 || !!this.pending;
  }

  /** Advance by `dt` seconds toward `wind`. Returns spectra to upload, or null. */
  update(dt, wind) {
    const aim = this.pending?.wind ?? this.wind;
    if (windChanged(aim, wind)) this.pending = { wind: { ...wind }, spectra: [] };
    if (this.pending) {
      const { pending } = this;
      pending.spectra.push(this.buildCascade(pending.spectra.length, pending.wind));
      if (pending.spectra.length === this.cascades.length) {
        // Restart from what is on screen, mid-transition or not: continuous either way.
        this.from = this.current;
        this.to = pending.spectra;
        this.wind = pending.wind;
        this.pending = null;
        this.progress = 0;
        this.sinceStep = SPECTRUM_STEP_SECONDS;
      }
    }
    if (this.progress >= 1) return null;
    this.progress = Math.min(1, this.progress + Math.max(0, dt) / this.transitionSeconds);
    this.sinceStep += Math.max(0, dt);
    if (this.progress < 1 && this.sinceStep < SPECTRUM_STEP_SECONDS) return null;
    this.sinceStep = 0;
    this.current = this.progress >= 1 ? this.to
      : blendCascadeSpectra(this.from, this.to, this.progress, this.cascades.map((c) => c.gaussians), this.size);
    if (this.progress >= 1) this.from = this.to = null;
    return this.current;
  }

  /** Jump to `wind` now (startup, QA capture). Returns spectra to upload, or null if already there. */
  settle(wind) {
    if (this.pending || windChanged(this.wind, wind)) {
      this.wind = { ...wind };
      this.current = this.build(this.wind);
    } else if (this.progress < 1) {
      this.current = this.to;
    } else {
      return null;
    }
    this.pending = this.from = this.to = null;
    this.progress = 1;
    return this.current;
  }
}

/** Per-mode power interpolation of two spectra on the same seeded Gaussians (pure). */
export function blendCascadeSpectra(from, to, a, gaussians, size) {
  return to.map((target, c) => {
    const source = from[c];
    const power = new Float64Array(target.power.length);
    for (let i = 0; i < power.length; i++) power[i] = source.power[i] + (target.power[i] - source.power[i]) * a;
    return {
      tileSizeMeters: target.tileSizeMeters, h0: createInitialSpectrum(gaussians[c], { size, power }),
      cycles: target.cycles, power, deltaK: target.deltaK,
    };
  });
}
