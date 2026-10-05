export const ROADSIDE_LANTERN_KEY = 'gods-end-fantasy-lantern-lanternroadside';
const SPACING = 40;

function hash(text) { let value = 2166136261; for (let i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619); } return (value >>> 0).toString(16); }

/** Route-local station generation. Stable identity does not depend on residency or route array order. */
export class RoadsideLanternGenerator {
  constructor(generator) {
    this.generator = generator;
    this.trails = generator.ensureTrailGrading?.();
    this.settlements = generator.ensureSettlementField?.();
    this.identities = new WeakMap();
  }

  *candidates(cellX, cellZ, reachMeters, tileSize) {
    if (!this.trails || !this.settlements) return;
    const radius = reachMeters / tileSize;
    const routes = new Map(this.trails.nearbyRoutesInBounds(cellX, cellZ, radius)
      .filter(near => this.generator.source.routes[near.route.index]?.group === 'roads')
      .map(near => [near.route, near]));
    const identityFor = route => {
      let identity = this.identities.get(route);
      if (!identity) {
        const source = this.generator.source.routes[route.index];
        identity = hash(JSON.stringify([source.id, source.points]));
        this.identities.set(route, identity);
      }
      return identity;
    };
    for (const route of [...routes.keys()].sort((a, b) => identityFor(a).localeCompare(identityFor(b)))) {
      const identity = identityFor(route);
      const along = routes.get(route).along;
      const first = Math.max(1, Math.floor((along - reachMeters * 2) / SPACING));
      const last = Math.min(Math.floor(route.length / SPACING), Math.ceil((along + reachMeters * 2) / SPACING));
      for (let station = first; station <= last; station++) {
        const distance = station * SPACING;
        const point = this.trails.pointAt(route, distance);
        if (Math.hypot(point.x - cellX, point.z - cellZ) * tileSize > reachMeters) continue;
        const towns = this.settlements.entriesAt(point.x, point.z) ?? [];
        if (!towns.some(entry => Math.hypot(point.x - entry.settlement.cellX, point.z - entry.settlement.cellZ) <= entry.reachCells)) continue;
        const a = this.trails.pointAt(route, Math.max(0, distance - 2));
        const b = this.trails.pointAt(route, Math.min(route.length, distance + 2));
        const dx = b.x - a.x, dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        if (length < 1e-6) continue;
        const offset = (route.halfWidth + this.trails.grading.shoulderMeters + 2) / tileSize;
        for (const [side, sign] of [['L', -1], ['R', 1]]) {
          const x = point.x - dz / length * offset * sign;
          const z = point.z + dx / length * offset * sign;
          if (this.settlements.cover?.(x, z) > 0.5) continue;
          if (this.trails.nearbyRoutes(x, z).some(near => Number.isFinite(near.distance) && near.distance < near.route.halfWidth + 1.5)) continue;
          yield { key: `lantern-v1:${identity}:${station}:${side}`, definitionKey: ROADSIDE_LANTERN_KEY,
            cellX: x, cellZ: z, x: x * tileSize, z: -z * tileSize,
            rotationY: Math.atan2(dx, -dz), routeId: this.generator.source.routes[route.index].id, station, side };
        }
      }
    }
  }
}
