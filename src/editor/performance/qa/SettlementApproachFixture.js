import { importAzgaarFullJson } from '../../import/AzgaarJsonImporter.js';
import { streetRoute } from './QaRouteWalker.js';

/**
 * A real frozen Azgaar burg; object-town remains a separate placed-object test.
 * `burgId` 18 is the measured perf workload; others (`?burg=` in the URL) are for looking at a
 * realm's town in game, e.g. Frostgard 287, Ironpeak/Stonehold 118, Grukmar 199.
 */
export async function prepareSettlementApproach({ controller, terrainView, config, fetchMap = fetch, burgId = 18 }) {
  const response = await fetchMap('/maps/Eldara%20Full%202026-07-23-20-37.json');
  if (!response.ok) throw new Error('Settlement QA could not load its frozen Azgaar map.');
  await controller.loadDocument(importAzgaarFullJson(await response.json(), config));
  const generator = terrainView.worldStore.generator;
  const field = generator.ensureSettlementField();
  const entry = field.entries.find(item => Number(item.settlement.id) === burgId);
  if (!entry) throw new Error(`Settlement QA burg ${burgId} is absent from the frozen map.`);
  const { plan } = field.ensurePlan(entry);
  const street = plan.streets.find(item => item.kind === 'main' && !item.avenue);
  if (!street?.points.length) throw new Error('Settlement QA burg has no approach street.');
  const endpoint = [...street.points].sort((a, b) => Math.hypot(...b) - Math.hypot(...a))[0];
  const length = Math.hypot(...endpoint) || 1;
  const tileSize = terrainView.worldStore.tileSize;
  const canonicalX = entry.settlement.cellX * tileSize + endpoint[0] * (1 + SPAWN_BEYOND_STREET_M / length);
  const canonicalZ = -entry.settlement.cellZ * tileSize - endpoint[1] * (1 + SPAWN_BEYOND_STREET_M / length);
  const origin = terrainView.floatingOrigin.getState();
  const townEdgeForward = approachTownEdgeForward(plan.buildings, endpoint);
  const toCanonical = ([x, z]) => ({ x: entry.settlement.cellX * tileSize + x, z: -entry.settlement.cellZ * tileSize - z });
  const route = streetRoute(plan.streets.filter(item => item.kind === 'main' && !item.avenue),
    { x: canonicalX, z: canonicalZ }, toCanonical);
  return { route, spawn: { x: canonicalX - origin.x, z: canonicalZ - origin.z },
    yawDegrees: Math.atan2(endpoint[0], -endpoint[1]) * 180 / Math.PI,
    settlementFixture: { map: 'Eldara Full 2026-07-23-20-37', burgId,
      name: entry.settlement.name, requestedBuildings: plan.buildings.length, requestedProps: plan.props.length,
      canonicalX, canonicalZ, townEdgeForward } };
}

/** How far the spawn stands outside the street's end (metres, along the approach). */
const SPAWN_BEYOND_STREET_M = 90;

/**
 * Metres from the spawn, walking in, to the first building beside the approach (within
 * 25 m of its line), or to the outermost building if none is beside it. A long main street
 * can run far past the last house, so cameras meant for foundations stand relative to this.
 */
export function approachTownEdgeForward(buildings, endpoint) {
  const length = Math.hypot(...endpoint) || 1;
  const [ux, uz] = [endpoint[0] / length, endpoint[1] / length];
  const reach = (beside) => buildings
    .filter(b => !beside || Math.abs(b.x * uz - b.z * ux) < 25)
    .reduce((best, b) => Math.max(best, b.x * ux + b.z * uz), -Infinity);
  const edge = Number.isFinite(reach(true)) ? reach(true) : reach(false);
  return Number.isFinite(edge) ? length + SPAWN_BEYOND_STREET_M - edge : null;
}
