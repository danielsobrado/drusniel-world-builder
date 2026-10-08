import { createShapeWallSurface } from './ShapeWallSurface.js';
import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { planShapeVolume } from './ShapeVolume.js';
import { shapeRandom } from './ShapeMesh.js';
import { resolveShapeCraftDetails } from './ShapeCraftDetails.js';

function childVolume(host, f, frame, fields) {
  const p = host.primitive;
  const id = `${p.id.slice(0, 24)}-f-${Math.floor(shapeRandom(0, p.id, 'feature-id', f.id) * 4294967295).toString(36)}`;
  const primitive = { ...p, id, label: `${p.label} · ${f.kind}`, position: [frame.origin[0], frame.origin[2]],
    rotation: frame.rotation, height: f.height, elevation: frame.origin[1], taper: 1, levels: 1, thickness: 0.16,
    footprint: { family: 'rounded', width: f.width, depth: f.depth, cornerRadius: Math.min(0.18, f.depth * 0.2, f.width * 0.2) },
    roof: { ...p.roof, family: 'gable', rise: Math.min(0.85, f.width * 0.32), sweep: 0.25, sag: 0.03, overhang: 0.16 },
    openings: [], features: [], craft: false, suppressed: [], ...fields };
  const plan = planShapeVolume(primitive);
  if (primitive.openings.some((o) => ['dormer-window', 'bay-window-0'].includes(o.id))) {
    const at = (primitive.footprint.width / 2 - primitive.footprint.cornerRadius) / plan.curve.length;
    return planShapeVolume({ ...primitive, openings: primitive.openings.map((o) =>
      ['dormer-window', 'bay-window-0'].includes(o.id) ? { ...o, at } : o) });
  }
  return plan;
}

function frameAt(plan, feature) {
  const wall = createShapeWallSurface(plan), u = feature.at * wall.length;
  const y = Math.min(feature.bottom, plan.primitive.height - 0.1);
  const origin = wall.point(u, y, plan.primitive.thickness / 2);
  const a = wall.point(u - 0.025, y), b = wall.point(u + 0.025, y);
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  const tangent = [(b[0] - a[0]) / length, 0, (b[2] - a[2]) / length];
  const sign = wall.clockwise ? -1 : 1, outward = [tangent[2] * sign, 0, -tangent[0] * sign];
  const rotation = Math.atan2(-outward[0], -outward[2]) * 180 / Math.PI;
  return { origin, tangent, outward, rotation, u };
}

const offset = (frame, distance, y = frame.origin[1]) =>
  [frame.origin[0] + frame.outward[0] * distance, y, frame.origin[2] + frame.outward[2] * distance];

const registry = new Map([
  ['bay', (host, f, frame) => ({ child: childVolume(host, f, { ...frame, origin: offset(frame, f.depth * 0.35) }, {
    height: Math.min(f.height, Math.max(0.5, host.primitive.height - f.bottom - 0.15)),
    roof: { ...host.primitive.roof, family: 'hip', rise: 0.5, overhang: 0.18, sweep: 0.3, sag: 0 },
    openings: [0.07, 0.3, 0.94].map((at, i) => ({ id: `bay-window-${i}`, role: 'window', profile: 'square', at,
      width: Math.min(0.9, f.width * 0.3, f.depth * 0.65), bottom: 0.2, height: Math.max(0.3, Math.min(f.height - 0.4, 1.3)) })),
  }) })],
  ['dormer', (host, f, frame) => {
    const p = host.primitive, roof = createShapeRoofSurface(host);
    const center = offset(frame, -Math.min(f.depth * 0.4, Math.min(p.footprint.width, p.footprint.depth) * 0.22));
    const front = [center[0] + frame.outward[0] * f.depth * 0.5, center[2] + frame.outward[2] * f.depth * 0.5];
    const elevation = Math.max(p.elevation + p.height + 0.02, roof.heightAt(...front) - 0.1);
    return { cutsRoof: true, child: childVolume(host, f, { ...frame, origin: [center[0], elevation, center[2]] }, {
      height: Math.min(f.height, Math.max(0.65, p.elevation + p.height + p.roof.rise - elevation - 0.25)),
      openings: [{ id: 'dormer-window', role: 'window', profile: 'arched', at: 0.06, width: f.width * 0.48,
        bottom: 0.16, height: Math.max(0.3, Math.min(0.85, f.height * 0.65)) }],
    }) };
  }],
  ['jetty', (host, f, frame) => {
    const p = host.primitive, elevation = p.elevation + p.height * (1 - 1 / Math.max(2, p.levels));
    return { replacesRoof: true, child: childVolume(host, f, { ...frame, origin: [p.position[0], elevation, p.position[1]], rotation: p.rotation }, {
      height: p.elevation + p.height - elevation, footprint: { ...p.footprint,
        width: p.footprint.width + f.depth * 2, depth: p.footprint.depth + f.depth * 2,
        cornerRadius: (p.footprint.cornerRadius ?? 0) + Math.min(0.3, f.depth) },
      roof: p.roof, facade: 'timber',
      openings: host.openings.filter((o) => o.bottom + p.elevation >= elevation).map((o) => ({ ...o, bottom: o.bottom + p.elevation - elevation })),
    }) };
  }],
  ['porch', (host, f, frame) => {
    const p = host.primitive, door = host.openings.filter((o) => o.role === 'door').sort((a, b) => Math.abs(a.at - f.at) - Math.abs(b.at - f.at))[0];
    const anchored = frameAt(host, { ...f, at: door?.at ?? f.at, bottom: 0 });
    return { frame: anchored, child: childVolume(host, f, { ...anchored, origin: offset(anchored, f.depth * 0.45, p.elevation) }, {
      height: Math.min(p.height - 0.15, Math.max(2.2, f.height)), footprint: { family: 'rounded', width: Math.max(f.width, (door?.width ?? 1) + 0.7), depth: f.depth, cornerRadius: 0.08 },
    }), openSides: true };
  }],
  ['buttress', (host, f, frame) => ({ frame: { ...frame, origin: offset(frame, 0, host.primitive.elevation) }, solidSupport: true })],
]);

/** Features are semantic modifiers expanded through shared volume/roof builders. */
export function resolveShapeFeatures(plan) {
  if (plan.primitive.kind !== 'curved-volume') return { ...plan, features: [] };
  const features = plan.primitive.features.flatMap((f) => {
    const key = `feature:${plan.id}:${f.id}`;
    if (plan.primitive.suppressed.includes(key)) return [];
    const frame = frameAt(plan, f), feature = registry.get(f.kind)(plan, f, frame);
    const child = feature.child ? resolveShapeCraftDetails({ ...feature.child, neighbors: [plan, ...(plan.neighbors ?? [])] }) : null;
    return [{ ...feature, child, frame: feature.frame ?? frame, intent: f, id: key, derivationKey: key,
      provenance: { source: 'authored', ruleId: 'architectural-feature', generatorVersion: 1, sourceEntityIds: [plan.id], derivationKey: key } }];
  });
  return { ...plan, features, roofReplaced: features.some((f) => f.replacesRoof),
    neighbors: [...(plan.neighbors ?? []), ...features.filter((f) => f.cutsRoof).map((f) => f.child)],
    rpg: { ...plan.rpg, ...Object.fromEntries(['collisionSlabs', 'walkableFloors', 'foundationContacts', 'coverSurfaces', 'portals', 'roomBoundaries'].map((key) =>
      [key, [...plan.rpg[key], ...features.filter((f) => f.child && !f.openSides && f.intent.kind !== 'dormer').flatMap((f) => f.child.rpg[key])]])) },
  };
}
