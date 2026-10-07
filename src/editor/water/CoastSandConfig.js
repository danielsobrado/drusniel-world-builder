export const DEFAULT_COAST_SAND = Object.freeze({
  enabled: true, dryDark: '#b39a72', dryLight: '#d6be96',
  seabedColor: '#efe6cf', seabedColorWeight: 0.55,
  reefColor: '#426356', reefRockColor: '#6d7b68', reefStrength: 0.55,
  causticStrength: 0.65,
});

export function resolveCoastSand(source = {}) {
  const settings = { ...DEFAULT_COAST_SAND, ...source };
  if (typeof settings.enabled !== 'boolean') throw new TypeError('coast.sand.enabled must be boolean.');
  for (const key of ['dryDark', 'dryLight', 'seabedColor', 'reefColor', 'reefRockColor']) {
    if (!/^#[0-9a-f]{6}$/i.test(settings[key])) throw new TypeError(`coast.sand.${key} must be a six-digit hex color.`);
  }
  for (const key of ['seabedColorWeight', 'reefStrength', 'causticStrength']) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 1) {
      throw new RangeError(`coast.sand.${key} must be within [0, 1].`);
    }
  }
  return settings;
}
