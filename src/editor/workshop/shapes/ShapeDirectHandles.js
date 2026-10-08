import { planRegisteredShape } from './ShapeRegistry.js';
import { createShapeWallSurface } from './ShapeWallSurface.js';
import { placeShapePoint } from './ShapePaths.js';
import { CurvePath } from '../curves/CurvePath.js';
import { evaluateCurveSegment } from '../curves/CurveSegment.js';
import { projectPointToCurvePath } from '../curves/CurveProjection.js';
import { shapeDetailPatch } from './ShapeDetailOverrides.js';
import { pointInShape } from './ShapeEnvelope.js';
import { shapeFeatureHandle, shapeFeatureHandleChanges } from './ShapeFeatureHandles.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function localPoint(p, position) {
  const angle = p.rotation * Math.PI / 180, dx = position[0] - p.position[0], dz = position[2] - p.position[1];
  return [dx * Math.cos(angle) + dz * Math.sin(angle), -dx * Math.sin(angle) + dz * Math.cos(angle)];
}
function wallHandle(plan, at, y, fields) {
  const surface = createShapeWallSurface(plan), u = at * surface.length;
  const position = surface.point(u, y, plan.primitive.thickness / 2 + 0.27);
  const a = surface.point(u, y), b = surface.point(u, y, 0.1);
  return { ...fields, position, normal: [b[0] - a[0], 0, b[2] - a[2]], at, y };
}

export function shapeDirectHandleDefinitions(editor) {
  const p = editor.primitive;
  if (!p || p.kind === 'traversal') return [];
  const plan = planRegisteredShape(p), result = [];
  result.push(...shapeFeatureHandle(editor, plan));
  const opening = p.openings.find((o) => o.id === editor.openingId);
  if (opening) result.push(wallHandle(plan, opening.at, opening.bottom + opening.height * 0.5,
    { field: 'opening', type: 'opening', id: opening.id, opening }));
  const decoration = editor.resolvedPlans?.get(p.id)?.decorations?.find((d) => d.id === editor.detailId);
  if (decoration?.role === 'window-box') {
    const source = p.openings.find((o) => o.id === decoration.openingId);
    if (source) result.push(wallHandle(plan, decoration.at ?? source.at, (decoration.bottom ?? source.bottom) - 0.15,
      { field: 'detail', type: 'box', key: decoration.id, bottom: decoration.bottom ?? source.bottom }));
  } else if (decoration?.role === 'chimney') result.push({ field: 'detail', type: 'chimney', key: decoration.id,
    position: [decoration.position[0], decoration.top + 0.15, decoration.position[2]], normal: [0, 1, 0] });
  if (editor.curveEditing) {
    const path = new CurvePath(plan.curve.path);
    for (const point of path.listPoints()) {
      const [x, z] = placeShapePoint(p, point.position);
      result.push({ field: `curve-point:${point.id}`, type: 'curve-point', id: point.id, path: path.toJSON(),
        position: [x, p.elevation + 0.23, z], normal: [0, 1, 0] });
    }
    for (const segment of path.listSegments()) if (segment.kind === 'quadratic') {
      const [x, z] = placeShapePoint(p, segment.control);
      result.push({ field: `curve-control:${segment.id}`, type: 'curve-control', id: segment.id, path: path.toJSON(),
        position: [x, p.elevation + 0.23, z], normal: [0, 1, 0] });
    }
  }
  return result;
}

/** Pointer motion produces only host-local semantic patches. */
export function shapeDirectHandleChanges(p, handle, delta) {
  if (handle.type === 'feature') return shapeFeatureHandleChanges(p, planRegisteredShape(p), handle, delta, localPoint);
  const target = handle.position.map((v, k) => v + delta[k]);
  if (handle.type.startsWith('curve-')) {
    const original = new CurvePath(handle.path), path = original.toJSON(), local = localPoint(p, target);
    if (handle.type === 'curve-point') {
      path.points = path.points.map((point) => point.id === handle.id ? { ...point, position: local } : point);
      // An edited endpoint turns an exact circular arc into a freeform curve of the same lineage.
      path.segments = path.segments.map((s) => {
        if (s.kind !== 'arc' || (s.startId !== handle.id && s.endId !== handle.id)) return s;
        const source = original.getSegment(s.id), midpoint = evaluateCurveSegment(source, 0.5).point;
        const { center, clockwise, ...fields } = s; void center; void clockwise;
        return { ...fields, kind: 'quadratic', control: midpoint.map((v, k) => 2 * v - (source.start[k] + source.end[k]) / 2) };
      });
    } else path.segments = path.segments.map((s) => s.id === handle.id ? { ...s, control: local } : s);
    return p.kind === 'curved-volume' ? { footprint: { ...p.footprint, family: 'custom', path } } : { path };
  }
  if (handle.type === 'chimney') {
    const local = localPoint(p, target), plan = planRegisteredShape(p);
    if (!pointInShape([target[0], target[2]], plan.topBoundary)) throw new Error('Keep the chimney on its roof.');
    return shapeDetailPatch(p, handle.key, { position: local });
  }
  const plan = planRegisteredShape(p), bottom = clamp((handle.type === 'opening' ? handle.opening.bottom : handle.bottom) + delta[1], 0,
    handle.type === 'opening' ? p.height - 0.3 : p.height - 0.1);
  const scale = p.kind === 'curved-volume' ? 1 + (p.taper - 1) * (bottom + (handle.type === 'opening' ? handle.opening.height * 0.5 : -0.15)) / p.height : 1;
  const projected = projectPointToCurvePath(plan.curve.path, localPoint(p, target).map((v) => v / scale));
  const at = clamp(projected.pathDistance / plan.curve.length, 0, 1);
  if (handle.type === 'box') return shapeDetailPatch(p, handle.key, { at, bottom });
  return { openings: p.openings.map((o) => o.id === handle.id ? { ...o, at, bottom } : o) };
}
