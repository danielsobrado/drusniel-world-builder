/** Derived registry cache; source edits invalidate it rather than migrate it. */
export const SETTLEMENT_REGISTRY_VERSION = 1;

function digest(value) {
  const text = JSON.stringify(value);
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}

export function settlementRegistryKey(source, seed) {
  return digest([SETTLEMENT_REGISTRY_VERSION, seed, source.settlements, source.bounds,
    source.physical, source.atlas.width, source.atlas.height, source.atlas.fields?.elevation ?? source.atlas.heightData,
    source.rivers, source.routes]);
}

export function serializeSettlementRegistry(field, key) {
  if (field.registry?.key === key) return field.registry;
  const indices = new Map(field.entries.map((entry, i) => [entry, i]));
  return { version: SETTLEMENT_REGISTRY_VERSION, key,
    tileSize: field.tileSize, worldSeed: field.worldSeed, routes: field.routes,
    bucketCells: field.bucketCells, landSearchStepCells: field.landSearchStepCells,
    entries: field.entries.map(({ settlement, reachCells }) => ({ settlement, reachCells })),
    ids: Object.fromEntries(field.entries.map((entry, i) => [entry.settlement.id, i])),
    buckets: Object.fromEntries([...field.buckets].map(([bucket, entries]) => [bucket, entries.map(entry => indices.get(entry))])) };
}

export function validSettlementRegistry(registry, key) {
  return registry?.version === SETTLEMENT_REGISTRY_VERSION && registry.key === key
    && Array.isArray(registry.entries) && registry.buckets && registry.ids
    && Number.isFinite(registry.bucketCells) && registry.bucketCells > 0;
}
