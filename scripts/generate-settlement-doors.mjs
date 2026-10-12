#!/usr/bin/env node
/**
 * Records where the workshop puts each pooled settlement house's main door,
 * and its ground-floor windows.
 *
 * A house's door is placed by its seeded grammar, anywhere along the front, so
 * only generating the house says where. The planner, the collision provider
 * and the interior builder all need that — in a terrain worker, before any mesh
 * exists — so it is measured once here and committed as plain data:
 * `src/editor/world/settlements/SettlementDoors.generated.js`. The rooms cut
 * the ground-floor windows into their walls and let the sun in through them
 * (SettlementInteriorGeometry, SettlementWindowLight), from
 * `src/editor/world/settlements/SettlementWindows.generated.js`.
 *
 * Re-run after changing the building catalog, the styles or the house
 * generators: npm run generate:settlement-doors   (--check fails if stale)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTLEMENT_BUILDINGS, buildingRecipe, poolKey } from '../src/editor/world/settlements/SettlementBuildingCatalog.js';
import { SETTLEMENT_STYLES } from '../src/editor/world/settlements/SettlementProfile.js';
import { createProceduralWorkshopComponentParts } from '../src/editor/workshop/ProceduralWorkshopComponentParts.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(rootDir, 'src/editor/world/settlements/SettlementDoors.generated.js');
const WINDOWS_OUTPUT = path.join(rootDir, 'src/editor/world/settlements/SettlementWindows.generated.js');
/** Windows whose sill is below this are the ground floor's, the storey the rooms stand in. */
const GROUND_FLOOR_SILL = 2;
const round = (value) => Math.round(value * 100) / 100;

/** The door a visitor uses: at ground level, in the front wall, the furthest forward. */
function mainDoor(components) {
  const doors = components.filter(({ kind, pivot, frameYaw }) => kind === 'door' && Math.abs(pivot[1]) < 0.4 && Math.abs(frameYaw ?? 0) < 0.01);
  return doors.sort((left, right) => right.pivot[2] - left.pivot[2])[0] ?? null;
}

/**
 * How far forward the wall's outermost surface stands where the door is. The
 * door hangs on the wall's core; the stones of a masonry storey stand proud of
 * it, and an open doorway drawn on the core would be buried behind them.
 */
function stoneFace(parts, door) {
  const [x, , z] = door.pivot;
  const reach = door.attachmentSize[0] / 2 + 0.2;
  let face = z;
  for (const part of parts) {
    const slot = part.material.userData.workshopSlot;
    if (slot !== 'stone' && slot !== 'mortar') continue;
    const position = part.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      if (y < 0.1 || y > door.attachmentSize[1] || Math.abs(position.getX(index) - x) > reach) continue;
      // Only the wall the door is in: anything far in front is a porch or a step.
      const depth = position.getZ(index);
      if (depth > face && depth < z + 0.6) face = depth;
    }
  }
  return face;
}

/**
 * The ground-floor windows in the walls' four faces: sill and head heights and
 * the wall's outward normal, all in the footprint's frame (the mesh's +x is
 * the footprint's −x). A window's pivot is the middle of its sill.
 */
function groundWindows(components) {
  return components
    .filter(({ kind, pivot }) => kind === 'window' && pivot[1] < GROUND_FLOOR_SILL)
    .map(({ pivot, frameYaw = 0, attachmentSize }) => ({
      x: round(-pivot[0]),
      z: round(pivot[2]),
      sill: round(pivot[1]),
      head: round(pivot[1] + attachmentSize[1]),
      width: round(attachmentSize[0]),
      nx: round(-Math.sin(frameYaw)),
      nz: round(Math.cos(frameYaw)),
    }))
    .sort((a, b) => a.nz - b.nz || a.nx - b.nx || a.x - b.x || a.z - b.z);
}

const entries = [];
const windowEntries = [];
for (const style of SETTLEMENT_STYLES) {
  for (const [kind, variants] of Object.entries(SETTLEMENT_BUILDINGS)) {
    variants.forEach((entry, variant) => {
      if (entry.archetype !== 'house') return;
      const parts = createProceduralWorkshopComponentParts(buildingRecipe(style, kind, variant, { openDoor: false }));
      const door = mainDoor(parts.components);
      const windows = groundWindows(parts.components);
      const face = door ? stoneFace(parts, door) : 0;
      for (const part of parts) part.geometry.dispose();
      if (!door) return;
      const list = windows.map((w) => `{ x: ${w.x}, z: ${w.z}, sill: ${w.sill}, head: ${w.head}, width: ${w.width}, nx: ${w.nx}, nz: ${w.nz} }`);
      windowEntries.push(`  '${poolKey(style.key, kind, variant)}': Object.freeze([${list.join(', ')}]),`);
      // The mesh's +x is the footprint's −x once placed (SettlementPlacements): stored in the footprint's frame.
      entries.push(`  '${poolKey(style.key, kind, variant)}': Object.freeze({ id: '${door.id}', x: ${round(-door.pivot[0])}, z: ${round(door.pivot[2])}, face: ${round(face)}, width: ${round(door.attachmentSize[0])}, height: ${round(door.attachmentSize[1])} }),`);
    });
  }
}
const source = `// Generated by scripts/generate-settlement-doors.mjs — do not edit.
// The main door of every pooled settlement house, in its footprint's frame:
// x along the frontage, z the front wall's core and face its outermost stone,
// as distances from the centre, in metres.
export const SETTLEMENT_DOORS = Object.freeze({
${entries.join('\n')}
});
`;
const windowSource = `// Generated by scripts/generate-settlement-doors.mjs — do not edit.
// The ground-floor windows of every pooled settlement house, in its footprint's
// frame: x along the frontage, z toward the front, the middle of the window in
// its wall; sill and head heights above the pad; nx, nz the wall's outward
// normal. Metres.
export const SETTLEMENT_WINDOWS = Object.freeze({
${windowEntries.join('\n')}
});
`;
const outputs = [[OUTPUT, source, `${entries.length} doors`], [WINDOWS_OUTPUT, windowSource, `${windowEntries.length} houses' windows`]];
if (process.argv.includes('--check')) {
  for (const [file, text] of outputs) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) {
      console.error(`${path.basename(file)} is stale; run npm run generate:settlement-doors.`);
      process.exit(1);
    }
  }
} else {
  for (const [file, text, summary] of outputs) {
    fs.writeFileSync(file, text);
    console.log(`${path.relative(rootDir, file)}: ${summary}`);
  }
}
