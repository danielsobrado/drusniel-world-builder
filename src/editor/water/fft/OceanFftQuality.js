import { CASCADE_CANDIDATES } from './OceanFftConstants.js';

/**
 * Which FFT each water quality tier runs (PR I phase I.3, I.0 Decision G). Pure.
 *
 * low / medium: off — the authored medium ripples stay.
 * high / ultra: 128² × 2 cascades (57.3 m, 15.45 m), ~1.29 MiB, ~0.06 ms GPU (I.2).
 * 256² × 2 stays research-only until a measured visible gain (I.8).
 *
 * The FFT also needs an explicit opt-in until I.4 ships its material and its
 * `offshoreFft` setting; without one it is off on every tier, so the scene does
 * no FFT work for a texture nothing samples.
 */
export const OCEAN_FFT_PROFILES = Object.freeze({
  low: null,
  medium: null,
  high: Object.freeze({ size: 128, cascades: CASCADE_CANDIDATES }),
  ultra: Object.freeze({ size: 128, cascades: CASCADE_CANDIDATES }),
});

/**
 * Effective profile: { enabled, reason, size, cascades, tileSizes }.
 * `unsupportedReason` is the renderer check (OceanFftRuntime.oceanFftUnsupportedReason).
 */
export function resolveOceanFftProfile({ qualityTier, requested = false, unsupportedReason = null }) {
  const off = (reason) => Object.freeze({ enabled: false, reason, size: 0, cascades: Object.freeze([]), tileSizes: Object.freeze([]) });
  if (!Object.hasOwn(OCEAN_FFT_PROFILES, qualityTier)) return off(`unknown water quality tier ${qualityTier}`);
  if (!requested) return off('not requested');
  const profile = OCEAN_FFT_PROFILES[qualityTier];
  if (!profile) return off(`off on the ${qualityTier} water tier`);
  if (unsupportedReason) return off(unsupportedReason);
  return Object.freeze({
    enabled: true, reason: null, size: profile.size, cascades: profile.cascades,
    tileSizes: Object.freeze(profile.cascades.map((cascade) => cascade.tileSizeMeters)),
  });
}
