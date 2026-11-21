import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { OFFSHORE_FFT_SEED, OFFSHORE_FFT_WIND } from './OceanFftConstants.js';
import { OFFSHORE_FFT_DEFAULTS } from './OceanFftConfig.js';
import { resolveOceanFftProfile } from './OceanFftQuality.js';
import { OceanFftRuntime, oceanFftUnsupportedReason } from './OceanFftRuntime.js';
import { OceanFftBinding } from './OceanFftSampling.js';
import { OceanFftSpectrumState } from './OceanFftSpectrumState.js';
import { resolveFftWind } from './OceanFftWeather.js';

/** Longest real-time step a transition takes from one frame (a stall must not skip it). */
const MAX_STEP_SECONDS = 0.25;

/**
 * The surface view's FFT (PR I phases I.3–I.5, I.0 Decision C): one runtime and one
 * shared binding per view, built once for the view's water tier. A tier change
 * rebuilds the whole surface view, so this is disposed and recreated with it:
 * one clean target rebuild, no per-slot instances, no material recompiles.
 *
 * Weather (I.5): `setWeather` takes the world's resolved wind each frame (cheap);
 * `prepare` moves the spectrum toward it through OceanFftSpectrumState and uploads
 * with `setSpectrum` (never `configure`), keeping the roughness table on the same
 * spectrum. Evolution stays on absolute water time, once per frame, never per capture.
 */
export class OceanFftController {
  /** The controller for this view, or null when the profile is off (reason logged once). */
  static create({ renderer, qualityTier, requested, log = console, gpu, weather }) {
    const profile = resolveOceanFftProfile({
      qualityTier, requested, unsupportedReason: requested ? oceanFftUnsupportedReason(renderer) : null,
    });
    if (!profile.enabled) {
      if (requested) log.warn?.(`[ocean-fft] off: ${profile.reason}.`);
      return null;
    }
    return new OceanFftController(renderer, profile, { log, gpu, weather });
  }

  /**
   * @param {object} [options.gpu] the runtime's resource factory, injectable for tests
   * @param {object} [options.weather] resolved `offshoreFft.weather`
   */
  constructor(renderer, profile, { log = console, gpu = undefined, weather = OFFSHORE_FFT_DEFAULTS.weather } = {}) {
    this.profile = profile;
    this.log = log;
    this.weatherSettings = weather;
    this.runtime = new OceanFftRuntime(renderer, { log, gpu });
    this.binding = new OceanFftBinding(profile);
    this.wind = resolveFftWind(null, weather);
    this.spectrum = new OceanFftSpectrumState({
      size: profile.size, cascades: profile.cascades, seed: OFFSHORE_FFT_SEED,
      fetchMeters: OFFSHORE_FFT_WIND.fetchMeters, transitionSeconds: weather.transitionSeconds, wind: this.wind,
    });
    this.weatherSeen = false;
    this.lastMs = null;
    this.runtime.configure({ size: profile.size, tileSizes: profile.tileSizes, spectra: this.spectrum.current });
    this.binding.setSpectra(this.spectrum.current);
  }

  get tileSizes() {
    return this.profile.tileSizes;
  }

  /**
   * This frame's resolved weather: `{ enabled, directionDegrees, intensity }` (WorldWindPass).
   * The first sample snaps (no fade-in from the reference at startup); later ones transition.
   */
  setWeather(weather) {
    this.wind = resolveFftWind(weather, this.weatherSettings);
    if (!this.weatherSeen) {
      this.weatherSeen = true;
      this.settleWeather();
    }
  }

  /** Finish any transition now (startup, QA captures): the spectrum is exactly the current wind's. */
  settleWeather() {
    const spectra = this.spectrum.settle(this.wind);
    if (spectra) this.upload(spectra);
  }

  /** Once per frame before the main draw, with the shared water clock. */
  prepare(timeSeconds, nowMs = performance.now()) {
    const dt = this.lastMs === null ? 0 : Math.min(MAX_STEP_SECONDS, Math.max(0, (nowMs - this.lastMs) / 1000));
    this.lastMs = nowMs;
    const spectra = this.spectrum.update(dt, this.wind);
    if (spectra) this.upload(spectra);
    this.runtime.prepare(timeSeconds);
    this.binding.update(this.runtime.output);
    // Read the fields directly: diagnostics() builds an object, and this runs every frame.
    PerfCounters.set('oceanFftActive', this.binding.available.value);
    PerfCounters.set('oceanFftBytes', this.runtime.resources?.bytes?.total ?? 0);
    PerfCounters.set('oceanFftTransforms', this.runtime.counters.transforms);
    PerfCounters.set('oceanFftWindSpeed', this.spectrum.wind.windSpeed);
  }

  /** GPU coefficients and the roughness table move together, or not at all. */
  upload(spectra) {
    if (!this.runtime.resources) return; // failed or lost: the authored detail is showing
    try {
      this.runtime.setSpectrum(spectra);
      this.binding.setSpectra(spectra);
    } catch (error) {
      // setSpectrum validates before uploading: the previous spectrum stays live.
      this.log.error?.(`[ocean-fft] weather spectrum rejected: ${error.message}`);
    }
  }

  dispose() {
    this.binding.dispose();
    this.runtime.dispose();
    PerfCounters.set('oceanFftActive', 0);
    PerfCounters.set('oceanFftBytes', 0);
  }
}
