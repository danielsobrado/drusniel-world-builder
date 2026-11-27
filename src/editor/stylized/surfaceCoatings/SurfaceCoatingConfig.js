/**
 * `stylizedSurface.surfaceCoatings`: how a snow or moss coat looks, never where
 * it lies — biome looks, the snowline, storms and each surface's own masks
 * still decide coverage. `enabled: false` on a coat compiles the materials as
 * they were before it.
 */
export const SURFACE_COATING_DEFAULTS = Object.freeze({
  snow: Object.freeze({ enabled: true, normalStrength: 0.7, roughness: 0.85 }),
  moss: Object.freeze({
    enabled: true,
    roughness: 0.95,
    /** Metres of cushion relief across a moss mat, and of tuft relief inside it. */
    pillowHeight: 0.02,
    tuftHeight: 0.004,
    /** How much darker the low ground between cushions is than their tops. */
    recessShade: 0.3,
    /**
     * The one moss pigment every surface grows (rocks, bark, deadwood): deep
     * shade, body and sunlit tips, in sRGB. Each surface still tints it by its
     * own biome look; a per-material palette made logs, trunks and stones in one
     * glade wear three different mosses.
     */
    palette: Object.freeze({ deep: '#2f3d21', dark: '#42522d', light: '#5d6e3e' }),
  }),
  /** Metres from the eye: full coat micro-detail before `near`, none past `far`. */
  detail: Object.freeze({ nearDistance: 20, farDistance: 65 }),
});

const UNIT = Object.freeze({
  snow: ['normalStrength', 'roughness'],
  moss: ['roughness', 'recessShade'],
});

function section(source, key) {
  const value = source[key] ?? {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`stylizedSurface.surfaceCoatings.${key} must be an object.`);
  }
  return { ...SURFACE_COATING_DEFAULTS[key], ...value };
}

export function resolveSurfaceCoatings(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('stylizedSurface.surfaceCoatings must be an object.');
  }
  const value = { snow: section(source, 'snow'), moss: section(source, 'moss'), detail: section(source, 'detail') };
  for (const [key, fields] of Object.entries(UNIT)) {
    if (typeof value[key].enabled !== 'boolean') {
      throw new TypeError(`stylizedSurface.surfaceCoatings.${key}.enabled must be a boolean.`);
    }
    for (const field of fields) {
      if (!Number.isFinite(value[key][field]) || value[key][field] < 0 || value[key][field] > 1) {
        throw new RangeError(`stylizedSurface.surfaceCoatings.${key}.${field} must be within [0, 1].`);
      }
    }
  }
  const palette = { ...SURFACE_COATING_DEFAULTS.moss.palette, ...(value.moss.palette ?? {}) };
  for (const [name, hex] of Object.entries(palette)) {
    if (!['deep', 'dark', 'light'].includes(name) || typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
      throw new TypeError(`stylizedSurface.surfaceCoatings.moss.palette.${name} must be a #rrggbb colour.`);
    }
  }
  value.moss.palette = Object.freeze(palette);
  for (const field of ['pillowHeight', 'tuftHeight']) {
    if (!Number.isFinite(value.moss[field]) || value.moss[field] < 0 || value.moss[field] > 0.1) {
      throw new RangeError(`stylizedSurface.surfaceCoatings.moss.${field} must be within [0, 0.1] metres.`);
    }
  }
  const { nearDistance, farDistance } = value.detail;
  if (!(nearDistance > 0) || !(farDistance > nearDistance)) {
    throw new RangeError('stylizedSurface.surfaceCoatings.detail needs 0 < nearDistance < farDistance.');
  }
  return value;
}

let registered = resolveSurfaceCoatings();

/** Called once by the config loader; materials built afterwards read it. */
export function registerSurfaceCoatings(settings) {
  registered = settings;
}

export function surfaceCoatings() {
  return registered;
}
