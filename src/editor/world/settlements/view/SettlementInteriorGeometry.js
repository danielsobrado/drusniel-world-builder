import { buildingEntry } from '../SettlementBuildingCatalog.js';
import { PLAIN, WOOD } from './SettlementInteriorSurface.js';
import { furnishRoom } from './SettlementRoomDressing.js';

/**
 * What is behind every open door of a settlement: a floor, four walls and a
 * ceiling, furnished by SettlementRoomDressing, and the doorway itself — the
 * reveals of the void the house leaves, its timber frame and the leaf standing
 * open.
 *
 * The pooled house meshes are shells: their walls face outward only and there
 * is nothing inside them. Rooms differ in size with every plot, so they are not
 * pooled; a whole town's worth is one small static mesh, like its paving.
 *
 * Pure geometry in settlement-local space: x is plan x, z is minus plan z, y is
 * absolute. No three.
 */

/** How a house is laid out for walking into; the collision provider builds its walls from the same numbers. */
export const HOUSE_SHELL = Object.freeze({
  /** A plot is its mesh plus a hand's breadth; the wall is inside it. */
  plotMargin: 0.5,
  wallThickness: 0.55,
  /** Clear width left for the character either side of the door's own. */
  doorwayEase: 0.3,
  ceiling: 2.7,
});

const FLOOR = [0.2, 0.13, 0.08];
const PLASTER = [0.5, 0.46, 0.38];
const CEILING = [0.09, 0.07, 0.05];
const TIMBER = [0.07, 0.046, 0.028];
/** The open door leaf: weathered boards with iron straps, as the kit towns' doors are. */
const LEAF = [0.085, 0.058, 0.036];
const LEAF_TONES = [1, 0.86, 1.1, 0.93];
const LEAF_BOARD = 0.18;
const LEAF_SEAM = 0.006;
const IRON = [0.045, 0.043, 0.04];
/**
 * The walls of one enterable house in its footprint's frame (x along the
 * frontage, z toward the front): the outer rectangle the collider blocks, and
 * the doorway in its front wall. Null for a building with no door to open.
 */
export function houseShell(building) {
  const { door } = building;
  if (!door) return null;
  const halfWidth = Math.max(1, building.width - HOUSE_SHELL.plotMargin) / 2;
  const back = -Math.max(1, building.depth - HOUSE_SHELL.plotMargin) / 2;
  // The front wall is where the mesh put its door, not where the plot ends.
  const front = Math.max(back + 2, door.z);
  const clear = Math.max(door.width, 0.9) + HOUSE_SHELL.doorwayEase;
  const left = Math.max(-halfWidth + HOUSE_SHELL.wallThickness, door.x - clear / 2);
  const right = Math.min(halfWidth - HOUSE_SHELL.wallThickness, door.x + clear / 2);
  return right - left >= 0.9 ? { halfWidth, back, front, doorLeft: left, doorRight: right } : null;
}

class InteriorBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.surfaces = [];
    /** Each room's windows in settlement-local metres, for the window light (SettlementWindowLight). */
    this.rooms = [];
    this.room = 0;
  }

  beginRoom() {
    this.room = this.rooms.length;
    this.rooms.push([]);
  }

  addWindow(window) {
    this.rooms[this.room].push(window);
  }

  /**
   * A quad through four settlement-local points, wound so that it faces along
   * `facing`. `color` and `surface` are one value, or one per point.
   */
  quad(points, facing, color, surface = PLAIN) {
    const corner = Array.isArray(color[0]) ? color : [color, color, color, color];
    const kind = Array.isArray(surface[0]) ? surface : [surface, surface, surface, surface];
    const [a, b, c, d] = points.map((point, index) => ({ point, color: corner[index], surface: kind[index] }));
    const [pa, pb, pd] = [a.point, b.point, d.point];
    const normal = [
      (pb[1] - pa[1]) * (pd[2] - pa[2]) - (pb[2] - pa[2]) * (pd[1] - pa[1]),
      (pb[2] - pa[2]) * (pd[0] - pa[0]) - (pb[0] - pa[0]) * (pd[2] - pa[2]),
      (pb[0] - pa[0]) * (pd[1] - pa[1]) - (pb[1] - pa[1]) * (pd[0] - pa[0]),
    ];
    const along = normal[0] * facing[0] + normal[1] * facing[1] + normal[2] * facing[2];
    const order = along >= 0 ? [a, b, c, a, c, d] : [a, d, c, a, c, b];
    const length = Math.hypot(...facing) || 1;
    for (const { point, color: shade, surface: tag } of order) {
      this.positions.push(...point);
      this.normals.push(facing[0] / length, facing[1] / length, facing[2] / length);
      this.colors.push(...shade);
      this.surfaces.push(...tag, this.room);
    }
  }
}

function addHouse(builder, building, shell) {
  const sin = Math.sin(building.yaw);
  const cos = Math.cos(building.yaw);
  // Footprint frame → settlement-local: +x is (cos, −sin) and +z is (sin, cos) in plan space, and local z is minus plan z.
  const at = (x, y, z) => [building.x + cos * x + sin * z, y, -(building.z - sin * x + cos * z)];
  const toward = (x, z) => [cos * x + sin * z, 0, -(-sin * x + cos * z)];
  const t = HOUSE_SHELL.wallThickness;
  const floor = building.pad + 0.05;
  const top = building.pad + Math.min(HOUSE_SHELL.ceiling, buildingEntry(building.kind, building.variant).height - 0.2);
  const [x0, x1, z0, z1] = [-shell.halfWidth + t, shell.halfWidth - t, shell.back + t, shell.front - t];
  const doorTop = Math.min(top - 0.1, building.pad + building.door.height);
  const wall = (ax, az, bx, bz, bottom, upper, facing, color = PLASTER, surface = PLAIN) => builder.quad(
    [at(ax, bottom, az), at(bx, bottom, bz), at(bx, upper, bz), at(ax, upper, az)], toward(...facing), color, surface);
  builder.beginRoom();
  // The light through the house's own ground-floor windows: the walls seen
  // from inside are the house mesh's, windows and all, so nothing is cut here;
  // the window light is traced to where the mesh has its openings.
  for (const window of building.windows ?? []) {
    if (building.pad + window.head > top + 0.5) continue;
    const middle = at(window.x, 0, window.z);
    const normal = toward(window.nx, window.nz);
    const length = Math.hypot(normal[0], normal[2]) || 1;
    builder.addWindow({ x: middle[0], z: middle[2], nx: normal[0] / length, nz: normal[2] / length,
      halfWidth: window.width / 2, sill: building.pad + window.sill, head: building.pad + window.head });
  }

  builder.quad([at(x0, floor, z0), at(x1, floor, z0), at(x1, floor, z1), at(x0, floor, z1)], [0, 1, 0], FLOOR);
  builder.quad([at(x0, top, z0), at(x1, top, z0), at(x1, top, z1), at(x0, top, z1)], [0, -1, 0], CEILING);
  wall(x0, z0, x1, z0, floor, top, [0, 1]);
  wall(x0, z0, x0, z1, floor, top, [1, 0]);
  wall(x1, z0, x1, z1, floor, top, [-1, 0]);
  // The front wall, from inside: either side of the doorway, and over it.
  wall(x0, z1, shell.doorLeft, z1, floor, top, [0, -1]);
  wall(shell.doorRight, z1, x1, z1, floor, top, [0, -1]);
  wall(shell.doorLeft, z1, shell.doorRight, z1, doorTop, top, [0, -1]);
  // The thickness of the wall in the doorway: both reveals and the soffit.
  wall(shell.doorLeft, z1, shell.doorLeft, shell.front, floor, doorTop, [1, 0], TIMBER);
  wall(shell.doorRight, z1, shell.doorRight, shell.front, floor, doorTop, [-1, 0], TIMBER);
  builder.quad([at(shell.doorLeft, doorTop, z1), at(shell.doorRight, doorTop, z1), at(shell.doorRight, doorTop, shell.front), at(shell.doorLeft, doorTop, shell.front)], [0, -1, 0], TIMBER);
  builder.quad([at(shell.doorLeft, floor, z1), at(shell.doorRight, floor, z1), at(shell.doorRight, floor, shell.front + 0.3), at(shell.doorLeft, floor, shell.front + 0.3)], [0, 1, 0], FLOOR);

  furnishRoom({
    x0, x1, z0, z1,
    height: top - floor,
    doorLeft: shell.doorLeft,
    doorRight: shell.doorRight,
    point: (x, y, z) => at(x, floor + y, z),
    toward,
    quad: (points, facing, color, surface) => builder.quad(points, facing, color, surface),
  }, Math.round(building.x * 131 + building.z * 71));

  // The doorway is a real void in the shell (`openDoorId`): the room shows
  // through it. Its frame, and the leaf standing open against the wall beside it,
  // just proud of the outermost stone of the wall there (SettlementDoors.generated).
  const proud = Math.max(shell.front, building.door.face ?? shell.front) + 0.1;
  const post = 0.12;
  wall(shell.doorLeft - post, proud + 0.02, shell.doorLeft, proud + 0.02, building.pad, doorTop + post, [0, 1], TIMBER, WOOD);
  wall(shell.doorRight, proud + 0.02, shell.doorRight + post, proud + 0.02, building.pad, doorTop + post, [0, 1], TIMBER, WOOD);
  wall(shell.doorLeft, proud + 0.02, shell.doorRight, proud + 0.02, doorTop, doorTop + post, [0, 1], TIMBER, WOOD);
  const leaf = (shell.doorRight - shell.doorLeft) * 0.92;
  const hinge = shell.doorRight + post;
  for (const facing of [[1, 0], [-1, 0]]) {
    const x = hinge + 0.03 * facing[0];
    // Boards of slightly different weathering, then iron straps just proud of them.
    const boards = Math.max(3, Math.round(leaf / LEAF_BOARD));
    for (let i = 0; i < boards; i += 1) {
      const pick = (i + Math.round(building.x * 7 + building.z * 3)) % LEAF_TONES.length;
      const tone = LEAF_TONES[(pick + LEAF_TONES.length) % LEAF_TONES.length];
      const z0 = proud + (leaf * i) / boards + LEAF_SEAM;
      const z1 = proud + (leaf * (i + 1)) / boards - LEAF_SEAM;
      wall(x, z0, x, z1, floor, doorTop, facing, LEAF.map((channel) => channel * tone), WOOD);
    }
    const strap = x + 0.012 * facing[0];
    for (const height of [0.32, (doorTop - floor) * 0.5, doorTop - floor - 0.34]) {
      wall(strap, proud + 0.02, strap, proud + leaf * 0.86, floor + height, floor + height + 0.07, facing, IRON);
    }
  }
}

/**
 * @param {object} plan a settlement plan whose buildings carry `door` and `pad`
 * @returns {?{ positions: Float32Array, normals: Float32Array, colors: Float32Array, surfaces: Float32Array, rooms: Array }}
 *   null when no house can be entered; `surfaces` is [wood, firelight, room] per vertex,
 *   and `rooms` each room's windows in settlement-local metres (SettlementWindowLight)
 */
export function settlementInteriorArrays(plan) {
  const builder = new InteriorBuilder();
  for (const building of plan.buildings) {
    const shell = houseShell(building);
    if (shell) addHouse(builder, building, shell);
  }
  if (builder.positions.length === 0) return null;
  return {
    positions: new Float32Array(builder.positions),
    normals: new Float32Array(builder.normals),
    colors: new Float32Array(builder.colors),
    surfaces: new Float32Array(builder.surfaces),
    rooms: builder.rooms,
  };
}
