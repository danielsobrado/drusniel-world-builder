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

/** Least room worth walking into, in metres a side. */
const MIN_ROOM = 2.2;

/**
 * The largest clear rectangle of floor behind the door: grown from just inside
 * it, a side at a time, until any part of the house — wall core, stone, post,
 * stair — would be inside. Rooms drawn to the plot instead had the shell's own
 * masonry standing in them. `[minX, maxX, minZ, maxZ]` in the mesh's frame, or
 * null when there is no room to speak of.
 */
function clearRoom(parts, door) {
  const points = [];
  for (const part of parts) {
    const position = part.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      if (y > 0.25 && y < 2.3) points.push(position.getX(index), position.getZ(index));
    }
  }
  const [doorX, , doorZ] = door.pivot;
  const room = [doorX - 0.45, doorX + 0.45, doorZ - 1.6, doorZ - 0.7];
  const blocked = () => {
    for (let index = 0; index < points.length; index += 2) {
      if (points[index] > room[0] && points[index] < room[1] && points[index + 1] > room[2] && points[index + 1] < room[3]) return true;
    }
    return false;
  };
  if (blocked()) return null;
  const step = 0.1;
  const growth = [-step, step, -step, 0];
  for (let grown = true; grown;) {
    grown = false;
    for (let side = 0; side < 3; side += 1) {
      room[side] += growth[side];
      if (blocked() || Math.abs(room[side] - (side < 2 ? doorX : doorZ)) > 12) room[side] -= growth[side];
      else grown = true;
    }
  }
  // Toward the door, the room runs up to the back of the wall the door is in.
  for (room[3] = doorZ - 0.7; room[3] < doorZ - 0.1; room[3] += 0.05) {
    if (blocked()) break;
  }
  room[3] -= 0.05;
  return room[1] - room[0] >= MIN_ROOM && room[3] - room[2] >= MIN_ROOM ? room : null;
}

/** Tallest a room is drawn, however high the storey over it. */
const MAX_CEILING = 3.3;

/**
 * How high the room is clear: the lowest face of the house over its floor —
 * the boards and joists of the storey above, usually. A ceiling drawn higher
 * than that is hidden behind them. Faces, not vertices: an upper floor is one
 * wide slab whose corners all lie outside the room.
 */
function clearCeiling(parts, room) {
  let ceiling = MAX_CEILING;
  const inset = 0.15;
  for (const part of parts) {
    const position = part.geometry.getAttribute('position');
    const index = part.geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let corner = 0; corner < count; corner += 3) {
      const [a, b, c] = [0, 1, 2].map((offset) => (index ? index.getX(corner + offset) : corner + offset));
      const lowest = Math.min(position.getY(a), position.getY(b), position.getY(c));
      if (lowest < 2.3 || lowest >= ceiling) continue;
      const xs = [position.getX(a), position.getX(b), position.getX(c)];
      const zs = [position.getZ(a), position.getZ(b), position.getZ(c)];
      const over = Math.max(...xs) > room[0] + inset && Math.min(...xs) < room[1] - inset
        && Math.max(...zs) > room[2] + inset && Math.min(...zs) < room[3] - inset;
      if (over) ceiling = lowest;
    }
  }
  return ceiling;
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
      const room = door ? clearRoom(parts, door) : null;
      const ceiling = room ? clearCeiling(parts, room) : null;
      for (const part of parts) part.geometry.dispose();
      if (!door) return;
      const list = windows.map((w) => `{ x: ${w.x}, z: ${w.z}, sill: ${w.sill}, head: ${w.head}, width: ${w.width}, nx: ${w.nx}, nz: ${w.nz} }`);
      windowEntries.push(`  '${poolKey(style.key, kind, variant)}': Object.freeze([${list.join(', ')}]),`);
      // The mesh's +x is the footprint's −x once placed (SettlementPlacements): stored in the footprint's frame.
      entries.push(`  '${poolKey(style.key, kind, variant)}': Object.freeze({ id: '${door.id}', x: ${round(-door.pivot[0])}, z: ${round(door.pivot[2])}, face: ${round(face)}, width: ${round(door.attachmentSize[0])}, height: ${round(door.attachmentSize[1])}, room: ${room ? `Object.freeze([${round(-room[1])}, ${round(-room[0])}, ${round(room[2])}, ${round(room[3])}])` : 'null'}, ceiling: ${room ? round(ceiling) : 'null'} }),`);
    });
  }
}
const source = `// Generated by scripts/generate-settlement-doors.mjs — do not edit.
// The main door of every pooled settlement house, in its footprint's frame:
// x along the frontage, z the front wall's core and face its outermost stone,
// as distances from the centre, in metres. room is the clear floor behind it,
// [minX, maxX, minZ, maxZ], or null when the house has none worth entering,
// and ceiling how high that room is clear of the storey above.
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
