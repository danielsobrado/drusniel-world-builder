import { addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { pointInShape } from './ShapeEnvelope.js';
import { shapeRandom } from './ShapeMesh.js';
import { clipShapePolygon } from './ShapePolygonClip.js';
import { ShapeUtils, Vector2 } from 'three/webgpu';
import polygonClipping from 'polygon-clipping';

const FLAG = 0.56;
const JOINT = 0.022;
const BENCH = { height: 0.44, depth: 0.38, seat: 0.07, nosing: 0.05 };

/** A building entered through open archways is seen inside: it gets paving and a wall bench. */
export function shapeHasOpenInterior(plan) {
  return Boolean(plan.interior?.paving || plan.interior?.bench);
}

function stoneTone(recipe, plan, domain, key) {
  const v = 0.78 + shapeRandom(recipe.seed, plan.id, domain, key) * 0.2;
  const warm = shapeRandom(recipe.seed, plan.id, `${domain}-warm`, key) - 0.5;
  return [v + warm * 0.04, v, v - warm * 0.05];
}

const BEDDING = 0.05;

function signedArea(polygon) {
  return polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
}

/** Clips a flag to a convex room, edge by edge; a concave room keeps only whole flags. */
function clipToRoom(flag, room, convex) {
  if (!convex) return flag.every((c) => pointInShape(c, room)) ? flag : [];
  const sign = Math.sign(signedArea(room));
  let polygon = flag.map((position) => ({ position }));
  for (let i = 0; i < room.length && polygon.length >= 3; i++) {
    const a = room[i], b = room[(i + 1) % room.length];
    const side = ([x, z]) => sign * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]));
    polygon = clipShapePolygon(polygon, side);
  }
  return polygon.length >= 3 ? polygon.map((v) => v.position) : [];
}

function isConvex(room) {
  const turns = room.map((a, i) => {
    const b = room[(i + 1) % room.length], c = room[(i + 2) % room.length];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  }).filter((t) => Math.abs(t) > 1e-9);
  return turns.every((t) => t > 0) || turns.every((t) => t < 0);
}

/** Ear clipping covers concave rooms without bridging their re-entrant corners. */
function fan(mesh, points, y, tone) {
  for (const indices of ShapeUtils.triangulateShape(points.map(p => new Vector2(...p)), [])) {
    const triangle = indices.map(i => points[i]);
    if (signedArea(triangle) > 0) triangle.reverse();
    mesh.triangle(...triangle.map(([x, z]) => [x, y, z]), tone);
  }
}

/** Staggered flags clipped to the room, set in a darker mortar bedding that shows in the joints. */
function buildFlagstones(plan, mesh, recipe, room) {
  const p = plan.primitive, angle = (p.rotation * Math.PI) / 180, base = p.elevation + BEDDING;
  const cos = Math.cos(angle), sin = Math.sin(angle), convex = isConvex(room);
  const toWorld = (u, v) => [p.position[0] + u * cos - v * sin, p.position[1] + u * sin + v * cos];
  // Far away the bedding alone reads as paving, so it takes the flag tone instead of the joint tone.
  fan(mesh, room, base, recipe.detail >= 2 ? [0.5, 0.48, 0.45] : [0.8, 0.78, 0.74]);
  if (recipe.detail < 2) return;
  const radius = Math.max(...room.map(([x, z]) => Math.hypot(x - p.position[0], z - p.position[1])));
  const rows = Math.ceil(radius / FLAG);
  for (let row = -rows; row <= rows; row++) {
    const shift = (Math.abs(row) % 2) * FLAG * 0.5;
    for (let col = -rows - 1; col <= rows; col++) {
      const u0 = col * FLAG + shift + JOINT / 2, u1 = (col + 1) * FLAG + shift - JOINT / 2;
      const v0 = row * FLAG + JOINT / 2, v1 = (row + 1) * FLAG - JOINT / 2;
      const square = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]].map(([u, v]) => toWorld(u, v));
      const flags = convex ? [clipToRoom(square, room, true)] : polygonClipping.intersection([square], [room]).map(p => p[0].slice(0, -1));
      for (const flag of flags) {
        if (flag.length < 3 || Math.abs(signedArea(flag)) < 0.01) continue;
        const lift = 0.012 + shapeRandom(recipe.seed, plan.id, 'flag-lift', `${row}:${col}`) * 0.008;
        fan(mesh, flag, base + lift, stoneTone(recipe, plan, 'flag', `${row}:${col}`));
      }
    }
  }
}

/** A stone bench along the inner face, broken at every archway. */
function buildWallBench(plan, meshes, recipe, surface, distances) {
  const p = plan.primitive, inner = -p.thickness / 2;
  for (let i = 0; i < distances.length - 1; i++) {
    const u0 = distances[i], u1 = distances[i + 1];
    const solid = wallSolidBands(surface, u0, u1, 0, BENCH.height, false)
      .some((band) => Math.min(...band.top) >= BENCH.height - 0.01 && Math.max(...band.bottom) <= 0.01);
    if (!solid) continue;
    const ends = { start: !wallSolidBands(surface, u0 - 0.05, u0, 0, BENCH.height, false).length,
      end: !wallSolidBands(surface, u1, u1 + 0.05, 0, BENCH.height, false).length };
    // Recessed base, then a seat slab that overhangs it.
    addWallPatch(meshes.trim, surface, u0, u1, BEDDING, BENCH.height - BENCH.seat, inner - BENCH.depth + BENCH.nosing,
      -(BENCH.depth - BENCH.nosing), [0.74, 0.72, 0.68], { back: false, ...ends });
    addWallPatch(meshes.trim, surface, u0, u1, BENCH.height - BENCH.seat, BENCH.height, inner - BENCH.depth,
      -BENCH.depth, stoneTone(recipe, plan, 'bench', Math.floor(u0 / 0.9)), { back: false, ...ends });
  }
}

export function buildShapePavilionInterior(plan, meshes, recipe, surface, distances) {
  if (!shapeHasOpenInterior(plan)) return;
  // Paving runs under the bench to the wall's inner face, so the archways are paved too.
  const room = plan.interior.room;
  if (plan.interior.paving) buildFlagstones(plan, meshes.deck, recipe, room);
  if (plan.interior.bench) buildWallBench(plan, meshes, recipe, surface, distances);
}
