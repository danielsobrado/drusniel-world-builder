import { createShapeWallSurface } from './ShapeWallSurface.js';
import { projectPointToCurvePath } from '../curves/CurveProjection.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function shapeFeatureHandle(editor, plan) {
  const feature = editor.resolvedPlans?.get(plan.id)?.features.find((f) => f.intent.id === editor.featureId);
  if (!feature || feature.intent.kind === 'jetty') return [];
  const f = feature.intent, surface = createShapeWallSurface(plan), at = feature.frame.u / surface.length;
  const bottom = feature.balcony?.bottom ?? Math.max(0, feature.frame.origin[1] - plan.primitive.elevation);
  const y = bottom + (feature.balcony?.height ?? feature.child?.primitive.height ?? Math.min(f.height, plan.primitive.height)) * 0.5;
  const position = surface.point(at * surface.length, Math.min(bottom, plan.primitive.height), plan.primitive.thickness / 2 + f.depth + 0.12);
  position[1] = plan.primitive.elevation + y;
  return [{ field: 'feature', type: 'feature', id: f.id, at, bottom: f.bottom,
    anchorY: Math.min(bottom, plan.primitive.height), position, normal: feature.frame.outward }];
}

export function shapeFeatureHandleChanges(p, plan, handle, delta, localPoint) {
  const feature = p.features.find((f) => f.id === handle.id);
  const bottom = ['bay', 'balcony'].includes(feature.kind) ? clamp(handle.bottom + delta[1], 0, Math.min(16, p.height - 0.15)) : feature.bottom;
  const anchorY = ['bay', 'balcony'].includes(feature.kind) ? Math.min(bottom, p.height) : handle.anchorY;
  const scale = 1 + (p.taper - 1) * anchorY / p.height;
  // The offset handle is projected from the wall's original anchor, so a curved
  // facade does not jump around its perimeter when the pointer first moves.
  const wall = createShapeWallSurface(plan), source = wall.point(handle.at * wall.length, handle.anchorY);
  const projected = projectPointToCurvePath(plan.curve.path, localPoint(p, source.map((v, k) => v + delta[k])).map((v) => v / scale));
  const at = clamp(projected.pathDistance / plan.curve.length, 0, 1);
  return { features: p.features.map((f) => f.id === feature.id ? { ...f, at, bottom } : f) };
}
