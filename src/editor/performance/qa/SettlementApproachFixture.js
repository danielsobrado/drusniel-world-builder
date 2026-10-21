import { importAzgaarFullJson } from '../../import/AzgaarJsonImporter.js';

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
  const canonicalX = entry.settlement.cellX * tileSize + endpoint[0] * (1 + 90 / length);
  const canonicalZ = -entry.settlement.cellZ * tileSize - endpoint[1] * (1 + 90 / length);
  const origin = terrainView.floatingOrigin.getState();
  return { spawn: { x: canonicalX - origin.x, z: canonicalZ - origin.z },
    yawDegrees: Math.atan2(endpoint[0], -endpoint[1]) * 180 / Math.PI,
    settlementFixture: { map: 'Eldara Full 2026-07-23-20-37', burgId,
      name: entry.settlement.name, requestedBuildings: plan.buildings.length, requestedProps: plan.props.length,
      canonicalX, canonicalZ } };
}
