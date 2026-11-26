/**
 * `config/wsc-contact.yaml` (`worldSurfaceContext.contact`):
 * Declarative per-family contact material blending profiles consumed by
 * `applyWorldSurfaceContact()` (WSC PR 4), each with an optional `conform`
 * block for the bounded vertex morph in `applyGroundContactDeform()` (PR 5).
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

/**
 * Vertex conform modes (`GroundContactDeformer.js`):
 * - `hug`: the base follows `H(vertex) - H(root)` (plants, whose root is not refit on CPU).
 * - `settle`: only the non-planar part `H(vertex) - plane(root)`, pull-down only, so a rim
 *   over a hollow or a convex ridge never floats while humps stay embedded (boulders,
 *   already sunk and tilted on CPU). Tree root plates have no conform: the CPU
 *   `TreeRootFitter` already sinks them below every exact terrain sample.
 */
export const WSC_CONFORM_MODES = Object.freeze(['hug', 'settle']);

const NO_CONFORM = Object.freeze({
  enabled: false,
  mode: 'hug',
  bandShare: 0,
  minBandMeters: 0.1,
  buryMeters: 0,
  maxOffsetMeters: 0.3,
});
const enabledConform = values => Object.freeze({ ...NO_CONFORM, enabled: true, ...values });

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
      conform: NO_CONFORM,
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
      conform: enabledConform({ mode: 'settle', bandShare: 0.2, minBandMeters: 0.08, maxOffsetMeters: 0.3 }),
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
      conform: NO_CONFORM,
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
      conform: enabledConform({ mode: 'hug', bandShare: 0.55, minBandMeters: 0.12, buryMeters: 0.03, maxOffsetMeters: 0.65 }),
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
      conform: enabledConform({ mode: 'hug', bandShare: 0.55, minBandMeters: 0.12, buryMeters: 0.03, maxOffsetMeters: 0.65 }),
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
      conform: NO_CONFORM,
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
      conform: NO_CONFORM,
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
      conform: NO_CONFORM,
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

function validateConform(name, conformValue) {
  const c = conformValue;
  const at = `worldSurfaceContext.contact.profiles.${name}.conform`;
  if (typeof c.enabled !== 'boolean') throw new TypeError(`${at}.enabled must be a boolean.`);
  if (!WSC_CONFORM_MODES.includes(c.mode)) throw new RangeError(`${at}.mode must be one of ${WSC_CONFORM_MODES.join(', ')}.`);
  if (!Number.isFinite(c.bandShare) || c.bandShare < 0 || c.bandShare > 1) throw new RangeError(`${at}.bandShare must be within [0, 1].`);
  if (!Number.isFinite(c.minBandMeters) || c.minBandMeters <= 0 || c.minBandMeters > 3) throw new RangeError(`${at}.minBandMeters must be within (0, 3].`);
  if (!Number.isFinite(c.buryMeters) || c.buryMeters < 0 || c.buryMeters > 0.5) throw new RangeError(`${at}.buryMeters must be within [0, 0.5].`);
  if (!Number.isFinite(c.maxOffsetMeters) || c.maxOffsetMeters <= 0 || c.maxOffsetMeters > 2) throw new RangeError(`${at}.maxOffsetMeters must be within (0, 2].`);
  return Object.freeze(c);
}

function validateProfile(name, merged, baseConform = NO_CONFORM) {
  const rawConform = merged.conform ?? {};
  if (!rawConform || typeof rawConform !== 'object' || Array.isArray(rawConform)) {
    throw new TypeError(`worldSurfaceContext.contact.profiles.${name}.conform must be an object.`);
  }
  merged.conform = validateConform(name, { ...baseConform, ...rawConform });
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
    const base = WSC_CONTACT_DEFAULTS.profiles[name];
    profiles[name] = validateProfile(name, { ...base, ...override }, base.conform);
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
    return validateProfile(profile.name ?? 'custom', { ...base, ...profile }, base.conform);
  }
  throw new TypeError('WSC contact profile must be a profile name string or object.');
}
