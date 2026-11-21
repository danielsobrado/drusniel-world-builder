import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { OFFSHORE_FFT_SEED, OFFSHORE_FFT_WIND } from './OceanFftConstants.js';
import { buildCascadeSpectra } from './OceanFftGpuLayout.js';
import { resolveOceanFftProfile } from './OceanFftQuality.js';
import { OceanFftRuntime, oceanFftUnsupportedReason } from './OceanFftRuntime.js';
import { OceanFftBinding } from './OceanFftSampling.js';
import { resolveOceanSpectrumParams } from './OceanSpectrum.js';

/**
 * The surface view's FFT (PR I phase I.3, I.0 Decision C): one runtime and one
 * shared binding per view, built once for the view's water tier. A tier change
 * rebuilds the whole surface view, so this is disposed and recreated with it:
 * one clean target rebuild, no per-slot instances, no material recompiles.
 */
export class OceanFftController {
  /** The controller for this view, or null when the profile is off (reason logged once). */
  static create({ renderer, qualityTier, requested, log = console, gpu }) {
    const profile = resolveOceanFftProfile({
      qualityTier, requested, unsupportedReason: requested ? oceanFftUnsupportedReason(renderer) : null,
    });
    if (!profile.enabled) {
      if (requested) log.warn?.(`[ocean-fft] off: ${profile.reason}.`);
      return null;
    }
    return new OceanFftController(renderer, profile, log, gpu);
  }

  /** `gpu` is the runtime's resource factory, injectable for tests (OceanFftRuntime). */
  constructor(renderer, profile, log = console, gpu = undefined) {
    this.profile = profile;
    this.runtime = new OceanFftRuntime(renderer, { log, gpu });
    this.binding = new OceanFftBinding(profile);
    const params = resolveOceanSpectrumParams(OFFSHORE_FFT_WIND);
    const spectra = buildCascadeSpectra({ size: profile.size, seed: OFFSHORE_FFT_SEED, params, cascades: profile.cascades });
    this.runtime.configure({ size: profile.size, tileSizes: profile.tileSizes, spectra });
    this.binding.setSpectra(spectra);
  }

  get tileSizes() {
    return this.profile.tileSizes;
  }

  /** Once per frame before the main draw, with the shared water clock. */
  prepare(timeSeconds) {
    this.runtime.prepare(timeSeconds);
    this.binding.update(this.runtime.output);
    // Read the fields directly: diagnostics() builds an object, and this runs every frame.
    PerfCounters.set('oceanFftActive', this.binding.available.value);
    PerfCounters.set('oceanFftBytes', this.runtime.resources?.bytes?.total ?? 0);
    PerfCounters.set('oceanFftTransforms', this.runtime.counters.transforms);
  }

  dispose() {
    this.binding.dispose();
    this.runtime.dispose();
    PerfCounters.set('oceanFftActive', 0);
    PerfCounters.set('oceanFftBytes', 0);
  }
}
