import { checksumCanonical } from '../persistence/canonicalSerialize.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function createWorldDefinition({
  worldId,
  seed,
  sourceFingerprint,
  projectionVersion = 1,
  schemaVersion = 1,
  physicalScale = { mapWidth: 0, mapHeight: 0, kilometersPerUnit: 1 },
  cultures = [],
  cultureCatalog = null,
  religions = [],
  biomes = [],
  sourceMeta = {},
}) {
  if (typeof worldId !== 'string' || worldId.length === 0) {
    throw Object.assign(new Error('invalid_world_id'), { code: 'invalid_world_id' });
  }
  return Object.freeze({
    worldId,
    seed: String(seed ?? ''),
    sourceFingerprint: String(sourceFingerprint ?? ''),
    projectionVersion,
    schemaVersion,
    physicalScale: Object.freeze({ ...physicalScale }),
    cultures: Object.freeze(sortById(cultures).map((c) => Object.freeze({ ...c }))),
    cultureCatalog: cultureCatalog == null ? null : deepFreeze(structuredClone(cultureCatalog)),
    religions: Object.freeze(sortById(religions).map((r) => Object.freeze({ ...r }))),
    biomes: Object.freeze([...biomes].map((b) => Object.freeze({ ...b }))),
    sourceMeta: Object.freeze({ ...sourceMeta }),
  });
}

function sortById(items) {
  return [...items].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function fingerprintWorldDefinition(definition) {
  return checksumCanonical({
    worldId: definition.worldId,
    seed: definition.seed,
    sourceFingerprint: definition.sourceFingerprint,
    projectionVersion: definition.projectionVersion,
    schemaVersion: definition.schemaVersion,
    physicalScale: definition.physicalScale,
    cultures: definition.cultures,
    cultureCatalog: definition.cultureCatalog,
    religions: definition.religions,
    biomes: definition.biomes,
  });
}
