import { buildingEntry } from '../SettlementBuildingCatalog.js';

/**
 * What is behind every open door of a settlement: a floor, four walls and a
 * ceiling, and the doorway itself — the dark opening, its timber frame and the
 * leaf standing open.
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
const TIMBER = [0.16, 0.1, 0.06];
/** The doorway seen from the street: the room beyond, in shadow. */
const DARK = [0.035, 0.028, 0.022];
/** The doorway seen from the room: the bright street outside. */
const DAYLIGHT = [2.6, 2.7, 2.8];

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
  }

  /** A quad through four settlement-local points, wound so that it faces along `facing`. */
  quad(points, facing, color) {
    const [a, b, c, d] = points;
    const normal = [
      (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]),
      (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]),
      (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]),
    ];
    const along = normal[0] * facing[0] + normal[1] * facing[1] + normal[2] * facing[2];
    const order = along >= 0 ? [a, b, c, a, c, d] : [a, d, c, a, c, b];
    const length = Math.hypot(...facing) || 1;
    for (const point of order) {
      this.positions.push(...point);
      this.normals.push(facing[0] / length, facing[1] / length, facing[2] / length);
      this.colors.push(...color);
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
  const wall = (ax, az, bx, bz, bottom, upper, facing, color = PLASTER) => builder.quad(
    [at(ax, bottom, az), at(bx, bottom, bz), at(bx, upper, bz), at(ax, upper, az)], toward(...facing), color);

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

  // From inside: daylight in the doorway. The shell's masonry runs unbroken
  // behind where its door hung, so the opening cannot simply be looked through.
  wall(shell.doorLeft, z1 + 0.02, shell.doorRight, z1 + 0.02, floor, doorTop, [0, -1], DAYLIGHT);
  // From the street: the shadowed opening over the wall the shell still draws
  // there. One-sided, so from inside the doorway looks out on the town.
  // Just proud of the outermost stone of the wall there (SettlementDoors.generated).
  const proud = Math.max(shell.front, building.door.face ?? shell.front) + 0.1;
  wall(shell.doorLeft, proud, shell.doorRight, proud, floor, doorTop, [0, 1], DARK);
  // Its frame, and the leaf standing open against the wall beside it.
  const post = 0.12;
  wall(shell.doorLeft - post, proud + 0.02, shell.doorLeft, proud + 0.02, building.pad, doorTop + post, [0, 1], TIMBER);
  wall(shell.doorRight, proud + 0.02, shell.doorRight + post, proud + 0.02, building.pad, doorTop + post, [0, 1], TIMBER);
  wall(shell.doorLeft, proud + 0.02, shell.doorRight, proud + 0.02, doorTop, doorTop + post, [0, 1], TIMBER);
  const leaf = shell.doorRight - shell.doorLeft;
  const hinge = shell.doorRight + post;
  for (const facing of [[1, 0], [-1, 0]]) {
    wall(hinge + 0.03 * facing[0], proud, hinge + 0.03 * facing[0], proud + leaf * 0.92, floor, doorTop, facing, TIMBER.map((channel) => channel * 1.25));
  }
}

/**
 * @param {object} plan a settlement plan whose buildings carry `door` and `pad`
 * @returns {?{ positions: Float32Array, normals: Float32Array, colors: Float32Array }} null when no house can be entered
 */
export function settlementInteriorArrays(plan) {
  const builder = new InteriorBuilder();
  for (const building of plan.buildings) {
    const shell = houseShell(building);
    if (shell) addHouse(builder, building, shell);
  }
  if (builder.positions.length === 0) return null;
  return { positions: new Float32Array(builder.positions), normals: new Float32Array(builder.normals), colors: new Float32Array(builder.colors) };
}
