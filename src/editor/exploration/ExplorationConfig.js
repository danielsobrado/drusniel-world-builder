const DEFAULTS = {
  freeFly: { enabled: true, moveSpeed: 24, fastMultiplier: 4, lookSensitivity: 0.003 },
  frameBudget: { enabled: true, targetFps: 144, reserveMs: 0.5, minimumMs: 0.25, maximumMs: 1.2 },
  drawPreparation: { enabled: true, meshesPerFrame: 2 },
  residents: { enabled: true, radiusMeters: 220, maxResidents: 24, maxPerSettlement: 8,
    wanderRadius: 18, refreshSeconds: 0.5 },
  serpents: { enabled: true, maxResident: 2, regionSize: 256, loadRadius: 180,
    unloadRadius: 260, spawnChance: 0.12, tileIds: [5, 7], sizeScale: 0.06, entries: [] },
  tour: { enabled: true, durationSeconds: 45, radiusMeters: 180, clearanceMeters: 18,
    lookAheadMeters: 12, preloadMeters: 40 },
  mobile: { enabled: true, maxShortSide: 900, requireCoarsePointer: true,
    pixelRatioCap: 1, initialQuality: 'low', lookSensitivity: 0.006 },
  recovery: { enabled: true },
  treeRoots: { enabled: true, rootHeight: 0.25, conformHeight: 3, maxSlope: 1.2,
    maxSink: 2, bury: 0.05, maxOverhang: 1 },
};

export function resolveExplorationConfig(source = {}) {
  const result = {};
  for (const [section, defaults] of Object.entries(DEFAULTS)) {
    const incoming = source[section] ?? {};
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      throw new Error(`exploration.${section} must be an object.`);
    }
    const block = { ...defaults, ...incoming };
    for (const [key, fallback] of Object.entries(defaults)) {
      const value = block[key];
      if (typeof fallback === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`exploration.${section}.${key} must be boolean.`);
      }
      if (typeof fallback === 'number' && (!Number.isFinite(value) || value < 0
        || (fallback > 0 && key !== 'spawnChance' && value === 0))) {
        throw new Error(`exploration.${section}.${key} must be a finite valid budget.`);
      }
    }
    result[section] = block;
  }
  for (const [section, key] of [['drawPreparation', 'meshesPerFrame'], ['residents', 'maxResidents'],
    ['residents', 'maxPerSettlement'], ['serpents', 'maxResident']]) {
    if (!Number.isSafeInteger(result[section][key])) throw new Error(`exploration.${section}.${key} must be an integer.`);
  }
  const snakes = result.serpents;
  if (result.frameBudget.maximumMs < result.frameBudget.minimumMs) {
    throw new Error('exploration.frameBudget.maximumMs must cover minimumMs.');
  }
  if (snakes.unloadRadius < snakes.loadRadius || snakes.spawnChance > 1
    || !Array.isArray(snakes.entries) || !Array.isArray(snakes.tileIds)
    || snakes.tileIds.some(id => !Number.isInteger(id) || id < 0 || id > 254)) {
    throw new Error('Invalid exploration.serpents residency or biome configuration.');
  }
  return result;
}
