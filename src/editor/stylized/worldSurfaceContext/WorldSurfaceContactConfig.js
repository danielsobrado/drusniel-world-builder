/**
 * `config/wsc-contact.yaml` (`worldSurfaceContext.contact`):
 * Declarative per-family contact material blending profiles consumed by
 * `applyWorldSurfaceContact()` (WSC PR 4).
 *
 * Follows the same validated register/read pattern as `SurfaceCoatingConfig.js`:
 * validated once in `loadEditorConfig()`, with deterministic defaults available
 * when shaders are compiled standalone in unit tests.
 */

export const WSC_CONTACT_PROFILE_NAMES = Object.freeze([
  'tree',
  'rock',
  'alpineRock',
  'understory',
  'bushProxy',
  'debris',
  'mossMound',
  'foundation',
]);

export const WSC_CONTACT_DEFAULTS = Object.freeze({
  enabled: true,
  profiles: Object.freeze({
    tree: Object.freeze({
      blendHeightMeters: 0.34,
      blendStartMeters: -0.04,
      noiseAmplitudeMeters: 0.18,
      surfaceShare: 0.68,
      roughnessShare: 0.85,
      normalShare: 0.50,
      contactAoBase: 0.10,
      contactAoField: 0.24,
      aoHeightMeters: 0.55,
      preserveIdentity: 0.18,
    }),
    rock: Object.freeze({
      blendHeightMeters: 0.36,
      blendStartMeters: -0.04,
      noiseAmplitudeMeters: 0.16,
      surfaceShare: 0.72,
      roughnessShare: 0.85,
      normalShare: 0.58,
      contactAoBase: 0.10,
      contactAoField: 0.22,
      aoHeightMeters: 0.45,
      preserveIdentity: 0.22,
    }),
    alpineRock: Object.freeze({
      blendHeightMeters: 0.40,
      blendStartMeters: -0.05,
      noiseAmplitudeMeters: 0.18,
      surfaceShare: 0.70,
      roughnessShare: 0.85,
      normalShare: 0.55,
      contactAoBase: 0.10,
      contactAoField: 0.20,
      aoHeightMeters: 0.50,
      preserveIdentity: 0.20,
    }),
    understory: Object.freeze({
      blendHeightMeters: 0.20,
      blendStartMeters: -0.02,
      noiseAmplitudeMeters: 0.06,
      surfaceShare: 0.48,
      roughnessShare: 0.70,
      normalShare: 0.45,
      contactAoBase: 0.08,
      contactAoField: 0.22,
      aoHeightMeters: 0.30,
      preserveIdentity: 0.15,
    }),
    bushProxy: Object.freeze({
      blendHeightMeters: 0.20,
      blendStartMeters: -0.02,
      noiseAmplitudeMeters: 0.06,
      surfaceShare: 0.42,
      roughnessShare: 0.65,
      normalShare: 0.45,
      contactAoBase: 0.08,
      contactAoField: 0.22,
      aoHeightMeters: 0.30,
      preserveIdentity: 0.15,
    }),
    debris: Object.freeze({
      blendHeightMeters: 0.22,
      blendStartMeters: -0.045,
      noiseAmplitudeMeters: 0.12,
      surfaceShare: 0.78,
      roughnessShare: 0.90,
      normalShare: 0.72,
      contactAoBase: 0.12,
      contactAoField: 0.24,
      aoHeightMeters: 0.28,
      preserveIdentity: 0.16,
    }),
    mossMound: Object.freeze({
      blendHeightMeters: 0.10,
      blendStartMeters: -0.03,
      noiseAmplitudeMeters: 0.05,
      surfaceShare: 0.76,
      roughnessShare: 0.85,
      normalShare: 0.65,
      contactAoBase: 0.06,
      contactAoField: 0.18,
      aoHeightMeters: 0.14,
      preserveIdentity: 0.15,
    }),
    foundation: Object.freeze({
      blendHeightMeters: 0.22,
      blendStartMeters: -0.03,
      noiseAmplitudeMeters: 0.08,
      surfaceShare: 0.42,
      roughnessShare: 0.75,
      normalShare: 0.18,
      contactAoBase: 0.10,
      contactAoField: 0.22,
      aoHeightMeters: 0.32,
      preserveIdentity: 0.24,
    }),
  }),
});

const UNIT_FIELDS = Object.freeze([
  'surfaceShare',
  'roughnessShare',
  'normalShare',
  'contactAoBase',
  'contactAoField',
  'preserveIdentity',
]);

function validateProfile(name, merged) {
  if (!Number.isFinite(merged.blendHeightMeters) || merged.blendHeightMeters <= 0 || merged.blendHeightMeters > 2) {
    throw new RangeError(`worldSurfaceContext.contact.profiles.${name}.blendHeightMeters must be within (0, 2].`);
  }
  if (!Number.isFinite(merged.blendStartMeters) || merged.blendStartMeters < -0.5 || merged.blendStartMeters >= merged.blendHeightMeters) {
    throw new RangeError(`worldSurfaceContext.contact.profiles.${name}.blendStartMeters must be < blendHeightMeters.`);
  }
  if (!Number.isFinite(merged.noiseAmplitudeMeters) || merged.noiseAmplitudeMeters < 0 || merged.noiseAmplitudeMeters > 1) {
    throw new RangeError(`worldSurfaceContext.contact.profiles.${name}.noiseAmplitudeMeters must be within [0, 1].`);
  }
  if (!Number.isFinite(merged.aoHeightMeters) || merged.aoHeightMeters <= 0 || merged.aoHeightMeters > 3) {
    throw new RangeError(`worldSurfaceContext.contact.profiles.${name}.aoHeightMeters must be within (0, 3].`);
  }
  for (const field of UNIT_FIELDS) {
    const value = merged[field];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`worldSurfaceContext.contact.profiles.${name}.${field} must be within [0, 1].`);
    }
  }
  return Object.freeze(merged);
}

/**
 * Resolves and validates `worldSurfaceContext.contact` from YAML source.
 */
export function resolveWorldSurfaceContactConfig(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('worldSurfaceContext.contact must be an object.');
  }
  const root = source.worldSurfaceContext?.contact ?? source.contact ?? source;
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new TypeError('worldSurfaceContext.contact must be an object.');
  }
  const enabled = root.enabled ?? WSC_CONTACT_DEFAULTS.enabled;
  if (typeof enabled !== 'boolean') {
    throw new TypeError('worldSurfaceContext.contact.enabled must be a boolean.');
  }
  const rawProfiles = root.profiles ?? {};
  if (!rawProfiles || typeof rawProfiles !== 'object' || Array.isArray(rawProfiles)) {
    throw new TypeError('worldSurfaceContext.contact.profiles must be an object.');
  }
  const profiles = {};
  for (const name of WSC_CONTACT_PROFILE_NAMES) {
    const override = rawProfiles[name] ?? {};
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      throw new TypeError(`worldSurfaceContext.contact.profiles.${name} must be an object.`);
    }
    profiles[name] = validateProfile(name, { ...WSC_CONTACT_DEFAULTS.profiles[name], ...override });
  }
  return Object.freeze({ enabled, profiles: Object.freeze(profiles) });
}

let registered = resolveWorldSurfaceContactConfig();

/** Called once by `loadEditorConfig()`; materials built afterwards read it. */
export function registerWorldSurfaceContactConfig(settings) {
  registered = resolveWorldSurfaceContactConfig(settings);
}

export function worldSurfaceContactConfig() {
  return registered;
}

/**
 * Resolves a profile by name or accepts an inline override object merged over
 * the named base profile (`baseName`).
 */
export function resolveContactProfile(profile, config = worldSurfaceContactConfig()) {
  const cfg = config ?? registered;
  if (typeof profile === 'string') {
    const found = cfg.profiles[profile];
    if (!found) throw new RangeError(`Unknown WSC contact profile "${profile}".`);
    return found;
  }
  if (profile && typeof profile === 'object') {
    const base = typeof profile.name === 'string' && cfg.profiles[profile.name]
      ? cfg.profiles[profile.name]
      : WSC_CONTACT_DEFAULTS.profiles.rock;
    return validateProfile(profile.name ?? 'custom', { ...base, ...profile });
  }
  throw new TypeError('WSC contact profile must be a profile name string or object.');
}
