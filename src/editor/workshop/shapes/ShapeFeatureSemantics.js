import { createShapeWallSurface } from './ShapeWallSurface.js';

const kinds = ['collisionSlabs', 'walkableFloors', 'foundationContacts', 'coverSurfaces', 'portals', 'roomBoundaries'];
export function shapeFeatureSemantics(plan, features) {
  const rpg = Object.fromEntries(kinds.map((key) => [key, [...plan.rpg[key]]]));
  for (const f of features) {
    const annotate = (value) => ({ ...value, hostId: plan.id, featureId: f.intent.id, provenance: f.provenance });
    if (f.balcony) {
      const b = f.balcony, elevation = plan.primitive.elevation + b.bottom;
      const footprint = { kind: 'polygon', points: b.footprint };
      rpg.walkableFloors.push(annotate({ id: `${f.id}:deck`, primitiveId: plan.id, elevation, thickness: 0.14, footprint }));
      rpg.collisionSlabs.push(annotate({ id: `${f.id}:deck`, primitiveId: plan.id, elevation: elevation - 0.14, height: 0.14, thickness: 0.14, footprint, gaps: [] }));
      const edges = [b.inner[0], ...b.outer, b.inner.at(-1)];
      for (let i = 0; i < edges.length - 1; i++) {
        const a = edges[i], c = edges[i + 1], length = Math.hypot(c[0] - a[0], c[2] - a[2]);
        if (length < 0.001) continue;
        const dx = -(c[2] - a[2]) / length * 0.05, dz = (c[0] - a[0]) / length * 0.05;
        const points = [[a[0] + dx, a[2] + dz], [c[0] + dx, c[2] + dz], [c[0] - dx, c[2] - dz], [a[0] - dx, a[2] - dz]];
        rpg.collisionSlabs.push(annotate({ id: `${f.id}:rail-${i}`, primitiveId: plan.id, elevation, height: b.height, thickness: 0.1, footprint: { kind: 'polygon', points }, gaps: [] }));
      }
    } else if (f.child && !f.openSides) {
      for (const key of kinds) rpg[key].push(...f.child.rpg[key].map(annotate));
    } else if (f.openSides) {
      rpg.walkableFloors.push(...f.child.rpg.walkableFloors.map(annotate));
      const surface = createShapeWallSurface(f.child), p = f.child.primitive;
      for (const [i, u] of [0, 0.25, 0.5, 0.75].entries()) {
        const [x, y, z] = surface.point(u * surface.length, 0);
        const points = [[x - 0.09, z - 0.09], [x + 0.09, z - 0.09], [x + 0.09, z + 0.09], [x - 0.09, z + 0.09]];
        rpg.collisionSlabs.push(annotate({ id: `${f.id}:post-${i}`, primitiveId: plan.id,
          elevation: y, height: p.height, thickness: 0.18, footprint: { kind: 'polygon', points }, gaps: [] }));
        rpg.foundationContacts.push(annotate({ id: `${f.id}:post-${i}:contact`, primitiveId: plan.id, elevation: y, footprint: { kind: 'polygon', points } }));
      }
    } else if (f.solidSupport) {
      const { frame, intent } = f, half = Math.min(intent.width, 0.7) / 2;
      const points = [[-half, 0], [half, 0], [half, intent.depth], [-half, intent.depth]].map(([x, z]) =>
        [frame.origin[0] + frame.tangent[0] * x + frame.outward[0] * z, frame.origin[2] + frame.tangent[2] * x + frame.outward[2] * z]);
      const footprint = { kind: 'polygon', points };
      rpg.collisionSlabs.push(annotate({ id: f.id, primitiveId: plan.id, elevation: frame.origin[1],
        height: Math.min(intent.height, plan.primitive.height * 0.86), thickness: half * 2, footprint, gaps: [] }));
      rpg.foundationContacts.push(annotate({ id: `${f.id}:contact`, primitiveId: plan.id, elevation: frame.origin[1], footprint }));
    }
  }
  return { ...plan.rpg, ...rpg };
}
