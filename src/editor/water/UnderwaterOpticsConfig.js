const DEFAULTS = Object.freeze({
  enabled: true,
  extinction: Object.freeze([0.1, 0.038, 0.045]),
  dimming: Object.freeze([0.11, 0.04, 0.035]),
  causticTileMeters: 5.5, causticStrength: 1.4, shaftStrength: 1.1,
  distortion: 0.0016, surfaceRefraction: 0.09, surfaceMirror: 0.62,
});

export function resolveUnderwaterOpticsConfig(source = {}) {
  const result = { ...DEFAULTS, ...source };
  if (typeof result.enabled !== 'boolean') throw new Error('Underwater optics.enabled must be boolean.');
  for (const key of ['extinction', 'dimming']) {
    if (!Array.isArray(result[key]) || result[key].length !== 3
        || result[key].some(value => !Number.isFinite(value) || value < 0 || value > 2)) {
      throw new Error(`Underwater optics.${key} requires three coefficients within [0, 2].`);
    }
    result[key] = Object.freeze([...result[key]]);
  }
  for (const key of ['causticTileMeters', 'causticStrength', 'shaftStrength', 'distortion', 'surfaceRefraction', 'surfaceMirror']) {
    if (!Number.isFinite(result[key]) || result[key] < 0) throw new Error(`Underwater optics.${key} must be non-negative and finite.`);
  }
  if (result.causticTileMeters <= 0) throw new Error('Underwater optics.causticTileMeters must be positive.');
  if (result.surfaceMirror > 1) throw new Error('Underwater optics.surfaceMirror must not exceed 1.');
  return Object.freeze(result);
}
