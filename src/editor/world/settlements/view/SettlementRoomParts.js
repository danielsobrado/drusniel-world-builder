/**
 * The palette and the one primitive every piece of a settlement room is built
 * from: an axis-aligned box in the room's own frame, handed to `room.quad`.
 * Pure; no three.
 */

import { PLAIN, WOOD } from './SettlementInteriorSurface.js';

export const STONE = [0.24, 0.22, 0.19];
/** Hearth stone, blackened by its own smoke. */
export const HEARTH_STONE = [0.1, 0.09, 0.08];
export const OAK = [0.075, 0.048, 0.03];
export const FURNITURE = [0.13, 0.085, 0.05];
/** Alternate planks of a table top, a shade apart, so the boards read. */
export const PLANK_TOP = [0.15, 0.1, 0.06];
/** Colours that are wood, and wear the timber grain. */
export const WOODS = new Set([OAK, FURNITURE, PLANK_TOP]);
export const IRON = [0.045, 0.043, 0.04];
export const LINEN = [0.42, 0.38, 0.3];
export const WOOL = [0.2, 0.08, 0.05];
export const CLAY = [0.36, 0.17, 0.08];
export const PEWTER = [0.3, 0.3, 0.29];
/** Colours whose boxes get chamfered top edges: furniture, bedding and the hearth. */
export const BEVELLED = new Set([FURNITURE, PLANK_TOP, LINEN, WOOL, HEARTH_STONE]);
export const SOOT = [0.03, 0.026, 0.022];
/** Embers glow: the room's material adds its own colour as light, so above 1 it burns. */
export const EMBERS = [1.5, 0.36, 0.05];
export const FLAME = [2.2, 0.72, 0.1];
/** Chamfer on the top edges of furniture: it catches a highlight, so a piece reads as made, not as a block. */
const BEVEL = 0.025;

/**
 * An axis-aligned box in room space, every face but its underside. Wooden
 * colours wear the timber grain. Furniture, bedding and the hearth have their
 * top edges chamfered; structure (joists, posts) stays square, since it is
 * seen from below and most of a room's boxes are structure.
 */
export function box(room, [xa, ya, za], [xb, yb, zb], color, surface = WOODS.has(color) ? WOOD : PLAIN) {
  const p = (x, y, z) => room.point(x, y, z);
  const shade = (factor) => color.map((channel) => channel * factor);
  const b = BEVELLED.has(color) && Math.min(xb - xa, zb - za, yb - ya) > BEVEL * 4 ? BEVEL : 0;
  const top = yb - b;
  room.quad([p(xa + b, yb, za + b), p(xb - b, yb, za + b), p(xb - b, yb, zb - b), p(xa + b, yb, zb - b)], [0, 1, 0], color, surface);
  room.quad([p(xa, ya, zb), p(xb, ya, zb), p(xb, top, zb), p(xa, top, zb)], room.toward(0, 1), shade(0.8), surface);
  room.quad([p(xa, ya, za), p(xb, ya, za), p(xb, top, za), p(xa, top, za)], room.toward(0, -1), shade(0.7), surface);
  room.quad([p(xa, ya, za), p(xa, ya, zb), p(xa, top, zb), p(xa, top, za)], room.toward(-1, 0), shade(0.75), surface);
  room.quad([p(xb, ya, za), p(xb, ya, zb), p(xb, top, zb), p(xb, top, za)], room.toward(1, 0), shade(0.75), surface);
  if (!b) return;
  const edge = (dx, dz) => {
    const out = room.toward(dx, dz);
    return [out[0] * 0.7, 0.7, out[2] * 0.7];
  };
  const lit = shade(1.12);
  room.quad([p(xa, top, zb), p(xb, top, zb), p(xb - b, yb, zb - b), p(xa + b, yb, zb - b)], edge(0, 1), lit, surface);
  room.quad([p(xa, top, za), p(xb, top, za), p(xb - b, yb, za + b), p(xa + b, yb, za + b)], edge(0, -1), lit, surface);
  room.quad([p(xa, top, za), p(xa, top, zb), p(xa + b, yb, zb - b), p(xa + b, yb, za + b)], edge(-1, 0), lit, surface);
  room.quad([p(xb, top, za), p(xb, top, zb), p(xb - b, yb, zb - b), p(xb - b, yb, za + b)], edge(1, 0), lit, surface);
}
