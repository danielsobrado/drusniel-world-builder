import { WorkshopSpatialIndex } from '../spatial/WorkshopSpatialIndex.js';
import polygonClipping from 'polygon-clipping';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';
import { shapeEnvelopeAtHeight, polylineTouchesShape, offsetShapePolygon, pointInShape } from './ShapeEnvelope.js';
import { resolvePathGates } from './ShapePathGateReaction.js';
import { resolveShapeCraftDetails } from './ShapeCraftDetails.js';
import { resolveShapeRoofJunctions } from './ShapeRoofJunctions.js';
import { resolveShapeStyles } from './ShapeStyles.js';
import { resolveShapeFeatures } from './ShapeFeatures.js';
import { resolveShapeGroundings } from './ShapeGrounding.js';
import { resolveShapeFeatureContacts } from './ShapeFeatureContacts.js';
import { resolveShapeInterior } from './ShapeInterior.js';

export function resolveShapeChemistry(plans) {
  const contacts = [],
    supports = [];
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  const index = new WorkshopSpatialIndex({
    listEntities: () =>
      plans.map((plan) => ({
        id: plan.id,
        properties: { spatialBounds: plan.bounds },
      })),
    getEntity: (id) => byId.get(id),
  });
  const resolved = plans.map((plan) => ({ ...plan, neighbors: [] }));
  for (const plan of resolved) {
    if (plan.primitive.kind === 'curved-volume') {
      for (const id of index.queryBounds(plan.bounds, {
        excludeIds: [plan.id],
      })) {
        const other = byId.get(id);
        if (other.primitive.kind !== 'curved-volume') continue;
        const a = plan.primitive,
          b = other.primitive;
        if (a.elevation + a.height <= b.elevation || b.elevation + b.height <= a.elevation)
          continue;
        const bottom = Math.max(a.elevation, b.elevation),
          top = Math.min(a.elevation + a.height, b.elevation + b.height);
        if (
          ![bottom, (bottom + top) / 2, top].some(
            (y) =>
              polygonClipping.intersection(
                [shapeEnvelopeAtHeight(plan, y)],
                [shapeEnvelopeAtHeight(other, y)],
              ).length,
          )
        )
          continue;
        plan.neighbors.push({
          id: other.id,
          boundary: other.boundary,
          topBoundary: other.topBoundary,
          curve: other.curve,
          primitive: other.primitive,
        });
        if (plan.id < other.id)
          contacts.push({
            id: `join:${plan.id}:${other.id}`,
            source: 'auto',
            ruleId: 'volume-contact',
            generatorVersion: 1,
            sourceEntityIds: [plan.id, other.id],
            derivationKey: `join:${plan.id}:${other.id}`,
          });
      }
      if (plan.primitive.elevation > tolerance.position) {
        const boundary = plan.boundary;
        const stride = Math.max(1, Math.floor(boundary.length / 4));
        const belowCandidates = index
          .queryBounds(plan.bounds, { excludeIds: [plan.id] })
          .map((id) => byId.get(id))
          .filter((other) => {
            const op = other.primitive;
            if (!['curved-wall', 'curved-volume'].includes(op.kind)) return false;
            return op.elevation <= plan.primitive.elevation + 0.1
              && op.elevation + op.height >= plan.primitive.elevation - 0.35;
          });
        const supportedByStructure = (x, z) => belowCandidates.some((other) => {
          const op = other.primitive;
          if (op.kind === 'curved-volume') {
            return pointInShape([x, z], offsetShapePolygon(other.boundary, op.thickness / 2 + 0.45));
          }
          const reach = op.thickness / 2 + 0.8;
          for (let k = 0; k < other.boundary.length - 1; k += 1) {
            const [ax, az] = other.boundary[k], [bx, bz] = other.boundary[k + 1];
            const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
            const t = len2 > 1e-8 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
            if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) <= reach) return true;
          }
          return false;
        });
        for (let i = 0; i < 4; i++) {
          const key = `support:${plan.id}:corner-${i}`;
          if (plan.primitive.suppressed.includes(key)) continue;
          const [x, z] = boundary[Math.min(i * stride, boundary.length - 1)];
          if (supportedByStructure(x, z)) continue;
          supports.push({
            id: key,
            derivationKey: key,
            source: 'auto',
            ruleId: 'raised-volume-support',
            generatorVersion: 1,
            sourceEntityIds: [plan.id],
            family: 'piers',
            position: [x, plan.primitive.elevation, z],
            height: plan.primitive.elevation,
          });
        }
      }
    }
    if (plan.primitive.kind === 'curved-wall') {
      for (const id of index.queryBounds(plan.bounds, { excludeIds: [plan.id] })) {
        const other = byId.get(id), a = plan.primitive, b = other.primitive;
        if (b.kind !== 'curved-volume' || a.elevation + a.height <= b.elevation || b.elevation + b.height <= a.elevation) continue;
        // A wall can pass clean through a tower with every sample outside it, so test edge crossings
        // against the shell at the bottom, middle and top of the shared height band.
        const bottom = Math.max(a.elevation, b.elevation), top = Math.min(a.elevation + a.height, b.elevation + b.height);
        const reach = a.thickness / 2 + b.thickness / 2;
        if (![bottom + 0.01, (bottom + top) / 2, top - 0.01].some((y) =>
          polylineTouchesShape(plan.boundary, offsetShapePolygon(shapeEnvelopeAtHeight(other, y), reach), plan.curve.closed))) continue;
        plan.neighbors.push({ id: other.id, boundary: other.boundary, topBoundary: other.topBoundary, curve: other.curve, primitive: other.primitive });
        const key = `join:${plan.id}:${other.id}`;
        contacts.push({ id: key, source: 'auto', ruleId: 'wall-tower-join', generatorVersion: 1,
          sourceEntityIds: [plan.id, other.id], derivationKey: key });
      }
    }
    supports.push(...(plan.supports ?? []));
  }
  for (const plan of resolved)
    plan.supports = supports.filter((s) => s.sourceEntityIds.includes(plan.id));
  const features = resolveShapeFeatureContacts(resolvePathGates(resolved, index, byId)
    .map(resolveShapeCraftDetails).map(resolveShapeFeatures));
  return { plans: resolveShapeGroundings(resolveShapeStyles(resolveShapeRoofJunctions(features.plans))).map(resolveShapeInterior),
    contacts: [...contacts, ...features.contacts], supports };
}
