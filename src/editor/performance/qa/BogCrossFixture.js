import { importAzgaarFullJson } from '../../import/AzgaarJsonImporter.js';

/** Grukmar's closed swamp forest (the world-visual `bog-forest` pose), canonical metres. */
export const BOG_CROSS_START = Object.freeze({ x: -3534792, z: -1471060, yawDegrees: 34 });

/**
 * The bog-cross perf route: the frozen Eldara import, spawned in Grukmar's
 * swamp forest and run straight through pools, islands, swamp giants and the
 * bog's ambient and VFX layers (docs/plans/swamp-aaa-plan-2026-10-21.md).
 */
export async function prepareBogCross({ controller, terrainView, config, fetchMap = fetch }) {
  const response = await fetchMap('/maps/Eldara%20Full%202026-07-23-20-37.json');
  if (!response.ok) throw new Error('Bog QA could not load its frozen Azgaar map.');
  await controller.loadDocument(importAzgaarFullJson(await response.json(), config));
  const origin = terrainView.floatingOrigin.getState();
  return {
    spawn: { x: BOG_CROSS_START.x - origin.x, z: BOG_CROSS_START.z - origin.z },
    yawDegrees: BOG_CROSS_START.yawDegrees,
    bogFixture: { map: 'Eldara Full 2026-07-23-20-37', canonicalX: BOG_CROSS_START.x, canonicalZ: BOG_CROSS_START.z },
  };
}
