import { buildingEntry } from '../SettlementBuildingCatalog.js';

/**
 * A whole settlement as massing: a box and a gable for every building.
 *
 * Past a few hundred metres the instanced meshes are culled — a town of them is
 * millions of triangles — and until this existed a city simply was not there
 * from the next hill. Fourteen triangles a building is enough to read as roofs
 * and walls at that distance, and a town of them is one small static mesh.
 *
 * Pure geometry in settlement-local space, like the paving: x is plan x, z is
 * minus plan z, y is absolute. No three.
 */

/** Kinds that are masonry all the way up: flat-topped, in the town's stone. */
const MASONRY = Object.freeze({ wall: [12, 2.2], tower: [6.6, 6.6], keep: [10.3, 8.2], gatehouse: [14.5, 6.8] });
/** Massing is drawn a little inside the real building, so the two never fight while both are drawn. */
const INSET = 0.92;
/** Roof rise as a share of the shorter side: a 40° pitch. */
const ROOF_RISE = 0.42;

/**
 * @param {object} plan a settlement plan
 * @param {{ stone: number[], roof: number[], walls: (building: object) => number[] }} colors
 *   linear RGB triples; `walls` picks a house's wall colour
 * @returns {{ positions: Float32Array, colors: Float32Array, indices: Uint32Array }}
 */
export function settlementSkylineArrays(plan, colors) {
  const positions = [];
  const vertexColors = [];
  const indices = [];
  const vertex = (x, y, z, color, shade) => {
    positions.push(x, y, -z);
    vertexColors.push(color[0] * shade, color[1] * shade, color[2] * shade);
    return positions.length / 3 - 1;
  };
  /** A quad given counter-clockwise as seen from outside, as two triangles. */
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);

  for (const building of plan.buildings) {
    const masonry = MASONRY[building.kind];
    const width = (masonry ? masonry[0] : building.width) * INSET;
    const depth = (masonry ? masonry[1] : building.depth) * INSET;
    const wallHeight = buildingEntry(building.kind, building.variant).height;
    const sin = Math.sin(building.yaw);
    const cos = Math.cos(building.yaw);
    // Local +x is (cos, −sin) and local +z is (sin, cos) in plan space.
    const at = (localX, localZ) => [building.x + cos * localX + sin * localZ, building.z - sin * localX + cos * localZ];
    const corners = [at(-width / 2, -depth / 2), at(width / 2, -depth / 2), at(width / 2, depth / 2), at(-width / 2, depth / 2)];
    const wall = masonry ? colors.stone : colors.walls(building);
    const base = building.pad - 0.5;
    const eaves = building.pad + wallHeight;
    for (let side = 0; side < 4; side += 1) {
      const [ax, az] = corners[side];
      const [bx, bz] = corners[(side + 1) % 4];
      // Each face gets its own shade: flat massing with one colour is a blob.
      const shade = 0.78 + 0.22 * ((side % 2) ? 1 : 0.55);
      quad(vertex(bx, base, bz, wall, shade * 0.8), vertex(ax, base, az, wall, shade * 0.8),
        vertex(ax, eaves, az, wall, shade), vertex(bx, eaves, bz, wall, shade));
    }
    if (masonry) {
      quad(...[3, 2, 1, 0].map((corner) => vertex(corners[corner][0], eaves, corners[corner][1], colors.stone, 1.05)));
      continue;
    }
    // A gable roof with its ridge along the longer side.
    const alongX = width >= depth;
    const ridgeHeight = eaves + Math.min(width, depth) * ROOF_RISE;
    const ridge = alongX ? [at(-width / 2, 0), at(width / 2, 0)] : [at(0, -depth / 2), at(0, depth / 2)];
    const order = alongX ? [0, 1, 2, 3] : [1, 2, 3, 0];
    const [p0, p1, p2, p3] = order.map((corner) => corners[corner]);
    const [r0, r1] = ridge;
    const eave = (point, shade) => vertex(point[0], eaves, point[1], colors.roof, shade);
    const top = (point, shade) => vertex(point[0], ridgeHeight, point[1], colors.roof, shade);
    quad(eave(p1, 0.8), eave(p0, 0.8), top(r0, 0.95), top(r1, 0.95));
    quad(eave(p3, 1), eave(p2, 1), top(r1, 1.15), top(r0, 1.15));
    // The two gable ends, in the wall colour.
    indices.push(vertex(p0[0], eaves, p0[1], wall, 0.9), vertex(p3[0], eaves, p3[1], wall, 0.9), vertex(r0[0], ridgeHeight, r0[1], wall, 0.9));
    indices.push(vertex(p2[0], eaves, p2[1], wall, 0.9), vertex(p1[0], eaves, p1[1], wall, 0.9), vertex(r1[0], ridgeHeight, r1[1], wall, 0.9));
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(vertexColors), indices: new Uint32Array(indices) };
}
