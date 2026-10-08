import { shapeChoice, shapeId, shapeRecord } from './ShapeValidation.js';
import { WorkshopSpatialIndex } from '../spatial/WorkshopSpatialIndex.js';

export function normalizeShapeStyle(value) {
  const input = shapeRecord(value, 'Shape style');
  return Object.freeze({
    ...(input.from !== undefined ? { from: shapeId(input.from, 'Style host') } : {}),
    ...Object.fromEntries(['floor', 'trim', 'supports', 'railing'].flatMap((key) =>
      input[key] === undefined ? [] : [[key, shapeChoice(input[key], `${key} material`, 'stone', ['stone', 'timber'])]])),
  });
}

function segmentDistance(point, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t);
}

/** Resolve a bounded contact graph. Authored per-property overrides always win. */
export function resolveShapeStyles(plans) {
  const byId = new Map(plans.map((p) => [p.id, p])), hosts = new Map();
  const index = new WorkshopSpatialIndex({ listEntities: () => plans.map((p) => ({ id: p.id,
    properties: { spatialBounds: p.bounds } })), getEntity: (id) => byId.get(id) });
  for (const plan of plans) {
    const from = plan.primitive.style.from;
    if (from && byId.has(from) && from !== plan.id) hosts.set(plan.id, from);
    else if (!from && plan.primitive.kind === 'traversal') {
      const bounds = { min: plan.bounds.min.map((v) => v - 0.75), max: plan.bounds.max.map((v) => v + 0.75) };
      const contacts = index.queryBounds(bounds, { excludeIds: [plan.id] }).map((id) => byId.get(id)).map((p) => {
        const distance = Math.min(...[plan.route[0], plan.route.at(-1)].flatMap(({ position }) =>
          p.boundary.slice(0, p.curve.closed ? undefined : -1).map((a, i) =>
            segmentDistance([position[0], position[2]], a, p.boundary[(i + 1) % p.boundary.length]))));
        return { id: p.id, distance, volume: p.primitive.kind === 'curved-volume' };
      }).filter((p) => p.distance < 0.75 + plan.primitive.width / 2)
        .sort((a, b) => Number(b.volume) - Number(a.volume) || a.distance - b.distance || a.id.localeCompare(b.id));
      if (contacts[0]) hosts.set(plan.id, contacts[0].id);
    }
  }
  // Break cycles at a stable owner, independently of document iteration order.
  for (const start of [...hosts.keys()].sort()) {
    const path = [];
    let id = start;
    while (hosts.has(id) && !path.includes(id)) { path.push(id); id = hosts.get(id); }
    if (path.includes(id)) hosts.delete(path.slice(path.indexOf(id)).sort()[0]);
  }
  const resolved = new Map();
  function visit(id, ancestors = new Set()) {
    if (resolved.has(id)) return resolved.get(id);
    const plan = byId.get(id), p = plan.primitive, hostId = hosts.get(id);
    const inherited = hostId && !ancestors.has(hostId) ? visit(hostId, new Set([...ancestors, id])) : null;
    const wood = p.surface === 'planks', frame = wood || p.facade === 'timber';
    const own = { floor: wood ? 'timber' : 'stone', trim: 'stone', supports: frame ? 'timber' : 'stone', railing: frame ? 'timber' : 'stone' };
    const style = { ...own, ...(inherited?.values ?? {}), ...p.style };
    delete style.from;
    const sources = Object.fromEntries(Object.keys(own).map((key) => [key,
      Object.hasOwn(p.style, key) || !inherited ? id : inherited.sources[key]]));
    const result = { values: style, sources, hostId: inherited ? hostId : null };
    resolved.set(id, result);
    return result;
  }
  return plans.map((p) => {
    const plan = { ...p, resolvedStyle: visit(p.id) };
    const families = new Set(plan.regions.map((r) => r.id.slice(p.id.length + 1)));
    if (p.supports?.length) families.add('supports');
    if (p.primitive.kind === 'traversal' && p.primitive.railing) families.add('rails');
    const regions = [...families].map((family) => {
      const original = p.regions.find((r) => r.id === `${p.id}:${family}`) ?? {
        id: `${p.id}:${family}`, primitiveId: p.id, componentId: p.id, label: `${p.primitive.label} · ${family}`, connected: true,
      };
      return ['deck', 'trim', 'supports', 'rails'].includes(family) ? {
        ...original, family: shapeStyleSlot(plan, family), inheritsFrom: shapeStyleSourceRegion(plan, family),
        inheritFallback: shapeStyleFallbackRegion(plan, family),
      } : original;
    });
    return { ...plan, regions };
  });
}

export function shapeStyleSlot(plan, family) {
  const property = { deck: 'floor', trim: 'trim', supports: 'supports', rails: 'railing' }[family];
  return property && plan.resolvedStyle?.values[property] === 'timber' ? 'wood' : 'stone';
}

export function shapeStyleSourceRegion(plan, family) {
  const property = { deck: 'floor', trim: 'trim', supports: 'supports', rails: 'railing' }[family];
  const owner = plan.resolvedStyle?.sources[property];
  if (!owner || owner === plan.id) return undefined;
  return `${owner}:${property === 'floor' ? 'deck' : shapeStyleSlot(plan, family) === 'wood' ? 'inserts' : 'trim'}`;
}

export function shapeStyleFallbackRegion(plan, family) {
  const source = shapeStyleSourceRegion(plan, family);
  return family === 'deck' && source ? `${plan.resolvedStyle.sources.floor}:${shapeStyleSlot(plan, family) === 'wood' ? 'inserts' : 'trim'}` : undefined;
}
