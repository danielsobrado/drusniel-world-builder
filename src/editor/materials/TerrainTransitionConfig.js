export const DEFAULT_TERRAIN_TRANSITIONS = Object.freeze({
  enabled: true, strength: 0.85, contrast: 0.32, width: 0.18,
  fadeStartDistance: 35, fadeEndDistance: 140,
});

export function resolveTerrainTransitionConfig(source = {}) {
  const result = { ...DEFAULT_TERRAIN_TRANSITIONS, ...source };
  if (typeof result.enabled !== 'boolean') throw new Error('Terrain transitions.enabled must be boolean.');
  for (const field of ['strength', 'contrast', 'width']) {
    if (!Number.isFinite(result[field]) || result[field] < 0 || result[field] > 1) {
      throw new Error(`Terrain transitions.${field} must be within [0, 1].`);
    }
  }
  if (!(result.width > 0 && result.width < 0.5)) throw new Error('Terrain transitions.width must be within (0, 0.5).');
  if (!Number.isFinite(result.fadeStartDistance) || result.fadeStartDistance < 0
      || !Number.isFinite(result.fadeEndDistance) || result.fadeEndDistance <= result.fadeStartDistance) {
    throw new Error('Terrain transitions require an increasing non-negative fade range.');
  }
  return Object.freeze(result);
}
