import { hash32 } from '../stylized/scatterMath.js';

/** Stable cosmetic representatives; never increments the authoritative population. */
export function residentManifest(settlement, { tileSize, worldSeed, settings, population = settlement.population }) {
  if (!(population > 0)) return [];
  const count = Math.min(settings.maxPerSettlement, Math.max(1, Math.ceil(Math.log2(1 + population))));
  return Array.from({ length: count }, (_, index) => {
    const seed = hash32(worldSeed ^ Math.imul(Number(settlement.id) || 1, 977) ^ index);
    const angle = seed / 0xffffffff * Math.PI * 2;
    const radius = 4 + index * 2;
    return {
      id: `settlement:${settlement.id}:resident:${index}`,
      settlementId: settlement.id,
      kind: settlement.capital && index === 0 ? 'paladin' : 'villager',
      x: (settlement.cellX + 0.5) * tileSize + Math.cos(angle) * radius,
      z: -(settlement.cellZ + 0.5) * tileSize + Math.sin(angle) * radius,
      wander: settings.wanderRadius,
      seed,
    };
  });
}

/** Query the existing settlement buckets; no per-frame scan of all burgs. */
export function nearbySettlements(field, focus, radiusMeters) {
  if (!field) return [];
  const cellX = focus.x / field.tileSize, cellZ = -focus.z / field.tileSize;
  const radius = radiusMeters / field.tileSize;
  const entries = new Set();
  for (let x = Math.floor((cellX - radius) / field.bucketCells); x <= Math.floor((cellX + radius) / field.bucketCells); x++) {
    for (let z = Math.floor((cellZ - radius) / field.bucketCells); z <= Math.floor((cellZ + radius) / field.bucketCells); z++) {
      for (const entry of field.buckets.get(`${x}:${z}`) ?? []) entries.add(entry);
    }
  }
  return [...entries].filter(entry => Math.hypot(entry.settlement.cellX - cellX,
    entry.settlement.cellZ - cellZ) <= radius + entry.reachCells)
    .sort((a, b) => Math.hypot(a.settlement.cellX - cellX, a.settlement.cellZ - cellZ)
      - Math.hypot(b.settlement.cellX - cellX, b.settlement.cellZ - cellZ))
    .map(entry => entry.settlement);
}
