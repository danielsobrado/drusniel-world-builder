/**
 * Biome-keyed geological rock family registry (Phase 11).
 *
 * Keeps rock material and geometric traits declarative and data-driven so
 * alpine granite/slate, desert sandstone, grassland/savanna limestone, and
 * mossy forest basalt each share tuned PBR parameters and fractured
 * silhouettes without archetype-specific branches in core views.
 */

export const GEOLOGICAL_ROCK_FAMILIES = Object.freeze({
  alpineGranite: Object.freeze({
    id: 'alpineGranite',
    label: 'Alpine Granite & Slate',
    tileIds: Object.freeze([10, 11]),
    stonePeriodMeters: 3.2,
    microPeriodMeters: 1.15,
    beddingDip: Object.freeze([0.09, -0.06]),
    roughnessMin: 0.82,
    roughnessMax: 0.97,
    mineralCool: '#8693a3',
    mineralWarm: '#b0aaa0',
    fractureStrength: 0.92,
  }),
  sedimentarySandstone: Object.freeze({
    id: 'sedimentarySandstone',
    label: 'Sedimentary Sandstone & Canyon Rock',
    tileIds: Object.freeze([1, 2, 32]),
    stonePeriodMeters: 2.5,
    microPeriodMeters: 1.0,
    beddingDip: Object.freeze([0.04, -0.02]),
    roughnessMin: 0.86,
    roughnessMax: 0.98,
    mineralCool: '#a8947a',
    mineralWarm: '#d4b287',
    fractureStrength: 0.86,
  }),
  weatheredLimestone: Object.freeze({
    id: 'weatheredLimestone',
    label: 'Weathered Limestone & Kopje Granite',
    tileIds: Object.freeze([3, 4]),
    stonePeriodMeters: 3.8,
    microPeriodMeters: 1.25,
    beddingDip: Object.freeze([0.06, 0.04]),
    roughnessMin: 0.84,
    roughnessMax: 0.96,
    mineralCool: '#9a968c',
    mineralWarm: '#cbc3b2',
    fractureStrength: 0.80,
  }),
  mossyBasalt: Object.freeze({
    id: 'mossyBasalt',
    label: 'Mossy Forest & Riverbank Basalt',
    tileIds: Object.freeze([5, 6, 7, 8, 9, 12]),
    stonePeriodMeters: 2.8,
    microPeriodMeters: 1.1,
    beddingDip: Object.freeze([0.11, -0.08]),
    roughnessMin: 0.76,
    roughnessMax: 0.94,
    mineralCool: '#6d757d',
    mineralWarm: '#8c9088',
    fractureStrength: 0.90,
  }),
});

const FAMILY_BY_TILE = new Map();
for (const family of Object.values(GEOLOGICAL_ROCK_FAMILIES)) {
  for (const tileId of family.tileIds) FAMILY_BY_TILE.set(tileId, family);
}

/** Resolves the geological rock family for an Azgaar biome tile ID. */
export function geologicalRockFamilyForTile(tileId) {
  return FAMILY_BY_TILE.get(tileId) ?? GEOLOGICAL_ROCK_FAMILIES.weatheredLimestone;
}
