import { createShapeWallSurface } from './ShapeWallSurface.js';

/** Optional interior finishes are derived outputs with the same suppression ownership as craft. */
export function resolveShapeInterior(plan) {
  const p = plan.primitive;
  if (p.kind !== 'curved-volume') return plan;
  const choice = p.interior ?? 'auto';
  const kind = choice === 'auto' ? (plan.openings.some(o => o.role === 'arch') ? 'bench' : 'none') : choice;
  const output = (role, enabled) => {
    const key = `detail:${p.id}:${role}`;
    return !enabled || p.suppressed.includes(key) ? null : { id: key, role, derivationKey: key,
      provenance: { source: 'auto', ruleId: 'interior-treatment', generatorVersion: 1, sourceEntityIds: [p.id], derivationKey: key } };
  };
  const paving = output('interior-paving', kind !== 'none'), bench = output('interior-bench', kind === 'bench');
  if (!paving && !bench) return { ...plan, interior: { kind, paving, bench, room: [] } };
  const surface = createShapeWallSurface(plan);
  const room = plan.curve.samples.map(s => { const point = surface.point(s.distance, 0, -p.thickness / 2 - 0.02); return [point[0], point[2]]; });
  return { ...plan, interior: { kind, paving, bench, room },
    decorations: [...(plan.decorations ?? []), ...[paving, bench].filter(Boolean)],
    rpg: { ...plan.rpg, walkableFloors: plan.rpg.walkableFloors.map((floor, i) =>
      paving && i === 0 ? { ...floor, surfaceOwner: paving.id, elevation: p.elevation + 0.065, footprint: { kind: 'polygon', points: room } } : floor) } };
}
