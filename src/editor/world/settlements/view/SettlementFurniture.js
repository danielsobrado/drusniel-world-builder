/**
 * Furniture for a settlement room — a trestle table and bench, a stool, a
 * chest, a posted bed, a shelf of crockery and a cask — each built from
 * chamfered boxes in the room's frame (SettlementRoomParts). Pure; no three.
 */

import { CLAY, FURNITURE, IRON, LINEN, OAK, PEWTER, PLANK_TOP, WOOL, box } from './SettlementRoomParts.js';

/**
 * A trestle table: a top of four planks with gaps between them over a pair of
 * trestles (posts, a foot and a stretcher), and a bench on splayed legs.
 */
export function table(room, x, z) {
  const planks = 4;
  const width = 0.8 / planks;
  for (let i = 0; i < planks; i += 1) {
    const za = z - 0.4 + i * width + 0.006;
    box(room, [x - 0.75, 0.72, za], [x + 0.75, 0.78, za + width - 0.012], i % 2 ? FURNITURE : PLANK_TOP);
  }
  for (const dx of [-0.55, 0.55]) {
    box(room, [x + dx - 0.04, 0.08, z - 0.06], [x + dx + 0.04, 0.72, z + 0.06], OAK);
    box(room, [x + dx - 0.05, 0, z - 0.34], [x + dx + 0.05, 0.08, z + 0.34], OAK);
    box(room, [x + dx - 0.05, 0.66, z - 0.36], [x + dx + 0.05, 0.72, z + 0.36], OAK);
  }
  box(room, [x - 0.55, 0.3, z - 0.03], [x + 0.55, 0.36, z + 0.03], OAK);
  // The bench: a thick plank on two pairs of legs leaning out.
  box(room, [x - 0.68, 0.42, z + 0.5], [x + 0.68, 0.47, z + 0.78], FURNITURE);
  for (const dx of [-0.52, 0.46]) {
    for (const [dz, lean] of [[0.53, -0.04], [0.69, 0.04]]) {
      box(room, [x + dx, 0, z + dz + lean], [x + dx + 0.06, 0.42, z + dz + lean + 0.06], OAK);
    }
  }
}

/** A three-legged stool by the hearth. */
export function stool(room, x, z) {
  box(room, [x - 0.17, 0.42, z - 0.17], [x + 0.17, 0.46, z + 0.17], FURNITURE);
  for (const [dx, dz] of [[-0.12, -0.1], [0.08, -0.1], [-0.02, 0.1]]) {
    box(room, [x + dx - 0.025, 0, z + dz - 0.025], [x + dx + 0.025, 0.42, z + dz + 0.025], OAK);
  }
}

export function chest(room, x, z) {
  box(room, [x - 0.4, 0, z], [x + 0.4, 0.48, z + 0.45], FURNITURE);
  for (const dx of [-0.3, 0.26]) box(room, [x + dx, 0.02, z + 0.45], [x + dx + 0.04, 0.47, z + 0.46], IRON);
}

/** A box bed against a side wall: oak frame, straw tick under linen, a wool blanket over its foot. */
export function bed(room, x, z, side) {
  const [xa, xb] = side > 0 ? [x - 1.0, x] : [x, x + 1.0];
  // Side rails and foot board on four corner posts, the head posts standing tall.
  box(room, [xa + 0.06, 0.18, z + 0.06], [xb - 0.06, 0.34, z + 1.94], FURNITURE);
  for (const [px, pz, h] of [[xa, z, 1.05], [xb - 0.09, z, 1.05], [xa, z + 1.91, 0.6], [xb - 0.09, z + 1.91, 0.6]]) {
    box(room, [px, 0, pz], [px + 0.09, h, pz + 0.09], OAK);
  }
  box(room, [xa + 0.09, 0.45, z + 0.02], [xb - 0.09, 0.95, z + 0.07], FURNITURE);
  box(room, [xa + 0.09, 0.34, z + 1.92], [xb - 0.09, 0.55, z + 1.97], FURNITURE);
  // Straw tick, linen, the bolster, and a wool blanket turned back.
  box(room, [xa + 0.07, 0.34, z + 0.08], [xb - 0.07, 0.5, z + 1.92], LINEN);
  box(room, [xa + 0.05, 0.44, z + 0.85], [xb - 0.05, 0.56, z + 1.93], WOOL);
  box(room, [xa + 0.05, 0.5, z + 0.8], [xb - 0.05, 0.58, z + 0.95], LINEN);
  box(room, [xa + 0.15, 0.5, z + 0.12], [xb - 0.15, 0.62, z + 0.45], LINEN);
}

/** A wall shelf of crocks, jugs and plates. */
export function shelf(room, x, z, random) {
  box(room, [x - 0.6, 1.35, z], [x + 0.6, 1.39, z + 0.28], FURNITURE);
  for (const dx of [-0.55, 0.51]) box(room, [x + dx, 1.2, z], [x + dx + 0.04, 1.35, z + 0.26], OAK);
  for (let i = 0; i < 4; i += 1) {
    const cx = x - 0.45 + i * 0.3 + (random() - 0.5) * 0.06;
    const h = 0.14 + random() * 0.14;
    const r = 0.06 + random() * 0.03;
    box(room, [cx - r, 1.39, z + 0.08], [cx + r, 1.39 + h, z + 0.08 + r * 2], random() < 0.6 ? CLAY : PEWTER);
  }
}

/** A cask on its end, banded with iron. */
export function cask(room, x, z) {
  box(room, [x - 0.26, 0, z - 0.26], [x + 0.26, 0.72, z + 0.26], FURNITURE);
  for (const y of [0.12, 0.58]) box(room, [x - 0.275, y, z - 0.275], [x + 0.275, y + 0.05, z + 0.275], IRON);
}
