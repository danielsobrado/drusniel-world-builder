import { createShapeWallSurface, addWallPatch } from './ShapeWallSurface.js';
import { pointInShape } from './ShapeEnvelope.js';
import { shapeRandom } from './ShapeMesh.js';
import { clipShapeMeshSet } from './ShapeRoofOcclusion.js';

export function resolveShapeGrounding(plan) {
  const p = plan.primitive, paving = [], masks = [];
  if (p.kind === 'traversal') masks.push({ kind: 'path', points: plan.boundary, width: p.width + 0.3 });
  else {
    masks.push(p.kind === 'curved-volume' ? { kind: 'polygon', points: plan.boundary } :
      { kind: 'path', points: plan.boundary, width: p.thickness + 0.3 });
    const surface = createShapeWallSurface(plan);
    for (const o of plan.openings) {
      if (o.role === 'window' || p.elevation + o.bottom > 0.2) continue;
      const u = o.at * surface.length, width = o.width + 0.6;
      const points = [surface.point(u - width / 2, 0, p.thickness / 2 + 0.04),
        surface.point(u + width / 2, 0, p.thickness / 2 + 0.04),
        surface.point(u + width / 2, 0, p.thickness / 2 + 1.8),
        surface.point(u - width / 2, 0, p.thickness / 2 + 1.8)];
      const key = `ground:${p.id}:entrance-${o.id}`;
      if (!p.suppressed.includes(key)) paving.push({ id: key, derivationKey: key, points,
        provenance: { source: 'auto', ruleId: 'entrance-paving', generatorVersion: 1, sourceEntityIds: [p.id], derivationKey: key } });
      masks.push({ kind: 'polygon', points: points.map(([x, , z]) => [x, z]) });
    }
    for (const feature of plan.features ?? []) if (feature.child && feature.intent.kind !== 'dormer')
      masks.push({ kind: 'polygon', points: feature.child.boundary });
    for (const contact of plan.rpg.foundationContacts) if (contact.featureId && contact.footprint?.kind === 'polygon') masks.push(contact.footprint);
  }
  return { ...plan, ground: { paving, masks } };
}

export function shapeGroundExcluded(point, masks) {
  return masks.some((mask) => {
    if (mask.kind === 'polygon') return pointInShape(point, mask.points);
    return mask.points.slice(0, -1).some((a, i) => {
      const b = mask.points[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz) <= mask.width / 2;
    });
  });
}

export function buildShapeGrounding(plan, meshes, recipe) {
  const p = plan.primitive;
  if (p.kind !== 'traversal' && p.elevation < 0.2) {
    const surface = createShapeWallSurface(plan), count = Math.ceil(surface.length / 0.24);
    for (let i = 0; i < count; i++) {
      const u0 = surface.length * i / count, u1 = surface.length * (i + 1) / count;
      if (surface.excluded((u0 + u1) / 2, 0.04)) continue;
      addWallPatch(meshes.trim, surface, u0, u1, -0.1, 0.09, p.thickness / 2 + 0.075, 0.12, [0.78, 0.79, 0.73], { back: false, start: false, end: false });
      const a = surface.point(u0, 0.11), b = surface.point(u0, 0.11, 0.1);
      const shade = Math.max(0, (b[0] - a[0]) * 0.6 - (b[2] - a[2]) * 0.8) / 0.1;
      if (recipe.detail < 2 || shapeRandom(recipe.seed, p.id, 'foundation-moss', i) > p.age * (0.15 + shade * 0.7)) continue;
      const points = [surface.point(u0, 0.02, p.thickness / 2 + 0.082), surface.point(u1, 0.025, p.thickness / 2 + 0.082),
        surface.point(u1, 0.04 + p.age * 0.06, p.thickness / 2 + 0.086), surface.point(u0, 0.06 + p.age * 0.04, p.thickness / 2 + 0.086)];
      meshes.foliage.quad(...(surface.clockwise ? points.toReversed() : points), [0.14, 0.22, 0.06]);
    }
  }
  const pavingMesh = clipShapeMeshSet(meshes, plan, { roofs: false }).trim;
  for (const paving of plan.ground.paving) {
    const [a, b, c, d] = paving.points, across = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.42));
    const rows = recipe.detail >= 2 ? 5 : 1;
    const point = (u, v) => a.map((n, k) => n + (b[k] - n) * u + (d[k] - n) * v);
    for (let row = 0; row < rows; row++) for (let col = 0; col < across; col++) {
      const gap = recipe.detail >= 2 ? 0.01 : 0;
      const quad = [point(col / across + gap, row / rows + gap), point((col + 1) / across - gap, row / rows + gap),
        point((col + 1) / across - gap, (row + 1) / rows - gap), point(col / across + gap, (row + 1) / rows - gap)];
      for (const v of quad) v[1] = 0.035 + p.elevation;
      const v = 0.72 + shapeRandom(recipe.seed, p.id, 'entrance-stone', `${paving.id}:${row}:${col}`) * 0.2;
      // Orientation is independent of wall winding.
      const crossY = (quad[1][2] - quad[0][2]) * (quad[2][0] - quad[0][0]) - (quad[1][0] - quad[0][0]) * (quad[2][2] - quad[0][2]);
      pavingMesh.quad(...(crossY > 0 ? quad : quad.toReversed()), [v, v, v * 0.95]);
    }
    void c;
  }
}
