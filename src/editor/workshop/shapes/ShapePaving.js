import polygonClipping from 'polygon-clipping';
import { shapeRandom } from './ShapeMesh.js';
import { addShapePolygonSurface } from './ShapePolygonSurface.js';

function signedArea(ring) {
  return ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
}

function buildTerraceCurb(mesh, polygons, base, height, primitive) {
  const tone = [0.76, 0.75, 0.71];
  for (const polygon of polygons) {
    addShapePolygonSurface(mesh, polygon, base + height, [0.46, 0.45, 0.41], primitive);
    for (let r = 0; r < polygon.length; r++) {
      const ring = polygon[r].slice(0, -1);
      if (ring.length < 3) continue;
      // Outer rings have one winding, inner holes the opposite; ensure curb sides face outward from solid.
      const area = signedArea(ring);
      const flip = r === 0 ? area < 0 : area > 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-4) continue;
        const p0 = [a[0], base, a[1]], p1 = [b[0], base, b[1]];
        const p2 = [b[0], base + height, b[1]], p3 = [a[0], base + height, a[1]];
        mesh.quad(...(flip ? [p0, p1, p2, p3] : [p3, p2, p1, p0]), tone);
      }
    }
  }
}

function buildTerraceFlags(mesh, paving, polygons, base, recipe, primitive) {
  if (recipe.detail < 2) return;
  const xs = polygons.flat(2).map(([x]) => x);
  if (!xs.length) return;
  const angle = ((primitive.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const cx = primitive.position[0], cz = primitive.position[1];
  const toLocal = (x, z) => [(x - cx) * cos + (z - cz) * sin, -(x - cx) * sin + (z - cz) * cos];
  const toWorld = (u, v) => [cx + u * cos - v * sin, cz + u * sin + v * cos];
  const locals = polygons.flat(2).map(([x, z]) => toLocal(x, z));
  const minU = Math.min(...locals.map(([u]) => u)), maxU = Math.max(...locals.map(([u]) => u));
  const minV = Math.min(...locals.map(([, v]) => v)), maxV = Math.max(...locals.map(([, v]) => v));
  const flag = 0.56, joint = 0.024;
  const r0 = Math.floor(minV / flag), r1 = Math.ceil(maxV / flag);
  const c0 = Math.floor(minU / flag) - 1, c1 = Math.ceil(maxU / flag) + 1;
  for (let row = r0; row <= r1; row++) {
    const shift = (Math.abs(row) % 2) * flag * 0.5;
    for (let col = c0; col <= c1; col++) {
      const u0 = col * flag + shift + joint / 2, u1 = (col + 1) * flag + shift - joint / 2;
      const v0 = row * flag + joint / 2, v1 = (row + 1) * flag - joint / 2;
      const stone = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => toWorld(u, v));
      let clipped;
      try { clipped = polygonClipping.intersection([stone], polygons); } catch { continue; }
      if (!clipped.length) continue;
      const random = shapeRandom(recipe.seed, primitive.id, 'terrace-flag', `${row}:${col}`);
      const tone = 0.78 + random * 0.14;
      const y = base + 0.015 + primitive.age * random * 0.008;
      for (const polygon of clipped) addShapePolygonSurface(mesh, polygon, y, [tone, tone * 0.99, tone * 0.95], primitive);
    }
  }
}

/** Entrance stones & foundation terraces share continuous bedding and crop to resolved access surfaces. */
export function buildShapePaving(paving, mesh, recipe, primitive) {
  const polygons = paving.polygons ?? [[paving.points.map(([x, , z]) => [x, z])]];
  const base = primitive.elevation;
  if (paving.role === 'terrace') {
    const height = paving.curbHeight ?? 0.14;
    buildTerraceCurb(mesh, polygons, base, height, primitive);
    buildTerraceFlags(mesh, paving, polygons, base + height, recipe, primitive);
    return;
  }
  for (const polygon of polygons) addShapePolygonSurface(mesh, polygon, base + 0.022, recipe.detail < 2 ? [0.78, 0.77, 0.72] : [0.42, 0.42, 0.38], primitive);
  if (recipe.detail < 2) return;
  const [a, b, , d] = paving.points;
  const width = Math.hypot(b[0] - a[0], b[2] - a[2]), depth = Math.hypot(d[0] - a[0], d[2] - a[2]);
  const across = Math.max(2, Math.ceil(width / 0.46)), rows = Math.max(1, Math.ceil(depth / 0.4));
  const point = (u, v) => [a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v, a[2] + (b[2] - a[2]) * u + (d[2] - a[2]) * v];
  for (let row = 0; row < rows; row++) for (let col = -1; col < across; col++) {
    const key = `${paving.id}:${row}:${col}`, shift = (row % 2) * 0.5;
    const u0 = (col + shift) / across + 0.012 / width, u1 = (col + shift + 1) / across - 0.012 / width;
    const v0 = row / rows + 0.012 / depth, v1 = (row + 1) / rows - 0.012 / depth;
    const stone = [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)];
    // polygon-clipping can fail to close a ring on near-degenerate overlaps; one cosmetic stone is skipped then.
    let clipped;
    try { clipped = polygonClipping.intersection([stone], polygons); } catch { continue; }
    const random = shapeRandom(recipe.seed, primitive.id, 'entrance-stone', key);
    const tone = 0.75 + random * 0.13, y = base + 0.035 + primitive.age * random * 0.007;
    for (const polygon of clipped) addShapePolygonSurface(mesh, polygon, y, [tone, tone, tone * 0.95], primitive);
  }
}
