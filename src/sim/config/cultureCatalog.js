const TARGET_TYPES = new Set(['none', 'culture', 'seed']);
const REQUIRED_OBJECT_FIELDS = Object.freeze([
  'identity',
  'architecture',
  'settlementGrammar',
  'food',
  'clothing',
  'military',
  'magic',
  'religion',
  'economy',
  'naming',
  'relations',
]);
const REQUIRED_STRING_ARRAY_FIELDS = Object.freeze([
  'regions',
  'values',
  'visualPalette',
  'storyHooks',
]);
const REQUIRED_OBJECT_ARRAY_FIELDS = Object.freeze([
  'socialClasses',
  'factions',
  'prejudices',
]);
const ANCESTRY_WEIGHT_EPSILON = 1e-6;

function invalid(path, message) {
  throw new Error('Invalid culture catalog: ' + path + ' ' + message + '.');
}

function assertObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, 'must be an object');
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(path, 'must be a non-empty string');
  }
}

function assertStringArray(value, path, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    invalid(path, allowEmpty ? 'must be an array' : 'must be a non-empty array');
  }
  for (let index = 0; index < value.length; index += 1) {
    assertNonEmptyString(value[index], path + '[' + index + ']');
  }
}

function assertObjectArray(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(path, 'must be a non-empty array');
  }
  for (let index = 0; index < value.length; index += 1) {
    assertObject(value[index], path + '[' + index + ']');
  }
}

function assertSourceIds(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(path, 'must be a non-empty array');
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const sourceId = value[index];
    if (!Number.isSafeInteger(sourceId) || sourceId < 0) {
      invalid(path + '[' + index + ']', 'must be a non-negative integer');
    }
    if (seen.has(sourceId)) {
      invalid(path, 'contains duplicate source ID ' + sourceId);
    }
    seen.add(sourceId);
  }
}

function assertAncestryWeights(weights, path) {
  assertObject(weights, path);
  const entries = Object.entries(weights);
  if (entries.length === 0) invalid(path, 'must define at least one ancestry');

  let total = 0;
  for (const [ancestry, weight] of entries) {
    assertNonEmptyString(ancestry, path + ' key');
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      invalid(path + '.' + ancestry, 'must be between 0 and 1');
    }
    total += weight;
  }

  if (Math.abs(total - 1) > ANCESTRY_WEIGHT_EPSILON) {
    invalid(path, 'must sum to 1; received ' + total);
  }
}

function validateCulture(key, culture, cultureKeys) {
  const path = 'cultures.' + key;
  assertObject(culture, path);
  if (culture.id !== key) invalid(path + '.id', 'must equal ' + key);
  assertNonEmptyString(culture.displayName, path + '.displayName');
  if (culture.status !== 'core') invalid(path + '.status', 'must be core');
  assertSourceIds(culture.azgaarCultureIds, path + '.azgaarCultureIds');
  assertAncestryWeights(culture.ancestryWeights, path + '.ancestryWeights');

  for (const field of REQUIRED_OBJECT_FIELDS) {
    assertObject(culture[field], path + '.' + field);
  }
  for (const field of REQUIRED_STRING_ARRAY_FIELDS) {
    assertStringArray(culture[field], path + '.' + field);
  }
  for (const field of REQUIRED_OBJECT_ARRAY_FIELDS) {
    assertObjectArray(culture[field], path + '.' + field);
  }

  const expectedPeers = cultureKeys.filter((peer) => peer !== key).sort();
  const actualPeers = Object.keys(culture.relations).sort();
  if (JSON.stringify(actualPeers) !== JSON.stringify(expectedPeers)) {
    invalid(path + '.relations', 'must define exactly one relation for every other core culture');
  }

  for (const peer of expectedPeers) {
    const relation = culture.relations[peer];
    const relationPath = path + '.relations.' + peer;
    assertObject(relation, relationPath);
    assertNonEmptyString(relation.stance, relationPath + '.stance');
    assertStringArray(relation.pressurePoints, relationPath + '.pressurePoints', true);
    assertStringArray(relation.ties, relationPath + '.ties', true);
  }
}

function validateSeed(key, seed) {
  const path = 'culturalSeeds.' + key;
  assertObject(seed, path);
  if (seed.id !== key) invalid(path + '.id', 'must equal ' + key);
  assertNonEmptyString(seed.displayName, path + '.displayName');
  if (seed.status !== 'seed') invalid(path + '.status', 'must be seed');
  assertNonEmptyString(seed.ancestry, path + '.ancestry');
  assertSourceIds(seed.azgaarCultureIds, path + '.azgaarCultureIds');
  assertStringArray(seed.regionalAssociations, path + '.regionalAssociations', true);
  assertNonEmptyString(seed.rule, path + '.rule');
  assertStringArray(seed.futureCultureCandidates, path + '.futureCultureCandidates', true);
}

function validateRegionalSphere(key, sphere) {
  const path = 'regionalSpheres.' + key;
  assertObject(sphere, path);
  if (sphere.id !== key) invalid(path + '.id', 'must equal ' + key);
  assertNonEmptyString(sphere.displayName, path + '.displayName');
  assertNonEmptyString(sphere.status, path + '.status');
  assertSourceIds(sphere.azgaarCultureIds, path + '.azgaarCultureIds');
  assertNonEmptyString(sphere.rule, path + '.rule');
  assertNonEmptyString(sphere.simulationUse, path + '.simulationUse');
}

function validateMappings(catalog) {
  if (!Array.isArray(catalog.sourceMappings) || catalog.sourceMappings.length === 0) {
    invalid('sourceMappings', 'must be a non-empty array');
  }

  const mappingsById = new Map();
  for (let index = 0; index < catalog.sourceMappings.length; index += 1) {
    const mapping = catalog.sourceMappings[index];
    const path = 'sourceMappings[' + index + ']';
    assertObject(mapping, path);

    if (!Number.isSafeInteger(mapping.sourceId) || mapping.sourceId < 0) {
      invalid(path + '.sourceId', 'must be a non-negative integer');
    }
    if (mappingsById.has(mapping.sourceId)) {
      invalid(path + '.sourceId', 'duplicates source ID ' + mapping.sourceId);
    }
    assertStringArray(mapping.sourceNames, path + '.sourceNames');

    if (!TARGET_TYPES.has(mapping.targetType)) {
      invalid(path + '.targetType', 'must be none, culture, or seed');
    }

    if (mapping.targetType === 'none') {
      if (mapping.targetKey != null) {
        invalid(path + '.targetKey', 'must be omitted for targetType none');
      }
    } else {
      assertNonEmptyString(mapping.targetKey, path + '.targetKey');
      const target = mapping.targetType === 'culture'
        ? catalog.cultures[mapping.targetKey]
        : catalog.culturalSeeds[mapping.targetKey];
      if (!target) {
        invalid(path + '.targetKey', 'references unknown ' + mapping.targetType + ' ' + mapping.targetKey);
      }
      if (!target.azgaarCultureIds.includes(mapping.sourceId)) {
        invalid(path + '.targetKey', 'target does not declare source ID ' + mapping.sourceId);
      }
    }

    mappingsById.set(mapping.sourceId, mapping);
  }

  for (const [key, culture] of Object.entries(catalog.cultures)) {
    for (const sourceId of culture.azgaarCultureIds) {
      const mapping = mappingsById.get(sourceId);
      if (!mapping || mapping.targetType !== 'culture' || mapping.targetKey !== key) {
        invalid('cultures.' + key + '.azgaarCultureIds', 'source ID ' + sourceId + ' must map back to culture ' + key);
      }
    }
  }

  for (const [key, seed] of Object.entries(catalog.culturalSeeds)) {
    for (const sourceId of seed.azgaarCultureIds) {
      const mapping = mappingsById.get(sourceId);
      if (!mapping || mapping.targetType !== 'seed' || mapping.targetKey !== key) {
        invalid('culturalSeeds.' + key + '.azgaarCultureIds', 'source ID ' + sourceId + ' must map back to seed ' + key);
      }
    }
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function normalizeMapName(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en-US');
}

export function validateCultureCatalog(catalog) {
  assertObject(catalog, 'catalog');
  if (!Number.isSafeInteger(catalog.schemaVersion) || catalog.schemaVersion < 1) {
    invalid('schemaVersion', 'must be a positive integer');
  }
  assertNonEmptyString(catalog.catalogId, 'catalogId');

  assertObject(catalog.source, 'source');
  assertStringArray(catalog.source.mapNames, 'source.mapNames');

  assertObject(catalog.principles, 'principles');
  assertStringArray(catalog.principles.dimensions, 'principles.dimensions');

  assertObject(catalog.cultures, 'cultures');
  const cultureKeys = Object.keys(catalog.cultures);
  if (cultureKeys.length === 0) invalid('cultures', 'must define at least one culture');
  for (const key of cultureKeys) validateCulture(key, catalog.cultures[key], cultureKeys);

  assertObject(catalog.culturalSeeds, 'culturalSeeds');
  for (const [key, seed] of Object.entries(catalog.culturalSeeds)) validateSeed(key, seed);

  assertObject(catalog.regionalSpheres, 'regionalSpheres');
  for (const [key, sphere] of Object.entries(catalog.regionalSpheres)) {
    validateRegionalSphere(key, sphere);
  }

  validateMappings(catalog);
  return catalog;
}

export function resolveCultureCatalog(catalog) {
  if (catalog == null) return null;
  const resolved = structuredClone(catalog);
  validateCultureCatalog(resolved);
  return deepFreeze(resolved);
}

export function catalogAppliesToCampaign(catalog, campaign) {
  if (!catalog) return false;
  const mapName = normalizeMapName(campaign?.source?.mapName);
  if (!mapName) return false;
  return catalog.source.mapNames.some((candidate) => normalizeMapName(candidate) === mapName);
}

export function resolveCultureCatalogForCampaign(catalog, campaign) {
  const resolved = resolveCultureCatalog(catalog);
  return catalogAppliesToCampaign(resolved, campaign) ? resolved : null;
}

export function resolveSourceCultureMapping(catalog, sourceId) {
  if (!catalog) return null;
  const numericSourceId = Number(sourceId);
  if (!Number.isSafeInteger(numericSourceId)) return null;
  return catalog.sourceMappings.find((mapping) => mapping.sourceId === numericSourceId) ?? null;
}
