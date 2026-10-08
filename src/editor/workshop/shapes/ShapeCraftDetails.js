import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { placeShapePoint } from './ShapePaths.js';
import { pointInShape } from './ShapeEnvelope.js';

const RULE = 'crafted-building-details';
function decoration(plan, role, suffix, fields = {}) {
  const key = `detail:${plan.id}:${suffix}`;
  if (plan.primitive.suppressed.includes(key)) return null;
  return {
    id: key, role, derivationKey: key, ...fields,
    provenance: { source: 'auto', ruleId: RULE, generatorVersion: 1,
      sourceEntityIds: [plan.id], derivationKey: key },
  };
}

/** Architectural dressing is resolved intent, never persisted generated geometry. */
export function resolveShapeCraftDetails(plan) {
  const p = plan.primitive;
  if (p.kind !== 'curved-volume' || !p.craft) return { ...plan, decorations: [] };
  const decorations = [];
  if (['gable', 'hip'].includes(p.roof.family) && plan.openings.some((o) => o.role === 'door')) {
    const roof = createShapeRoofSurface(plan);
    const [x, z] = placeShapePoint(p, [-p.footprint.width * p.taper * 0.23, p.footprint.depth * p.taper * 0.12]);
    const base = roof.heightAt(x, z) - 0.14;
    if (pointInShape([x, z], plan.topBoundary)) {
      decorations.push(decoration(plan, 'chimney', 'chimney', {
        position: [x, base, z], top: Math.max(base + 0.85, p.elevation + p.height + p.roof.rise + 0.25),
      }));
    }
  }
  for (const opening of plan.openings) {
    if (opening.role !== 'window' || opening.bottom < 0.65 || opening.width < 0.45) continue;
    decorations.push(decoration(plan, 'window-box', `box-${opening.id}`, { openingId: opening.id }));
  }
  const overrides = new Map((p.detailOverrides ?? []).map((o) => [o.key, o]));
  return { ...plan, decorations: decorations.filter(Boolean).map((d) => {
    const override = overrides.get(d.id);
    if (!override) return d;
    const provenance = { ...d.provenance, source: 'promoted' };
    if (d.role === 'window-box') {
      const source = plan.openings.find((o) => o.id === d.openingId), at = override.at ?? source.at;
      let bottom = Math.min(p.height - 0.1, override.bottom ?? source.bottom);
      for (const opening of plan.openings) {
        const dx = Math.min(Math.abs(at - opening.at), 1 - Math.abs(at - opening.at)) * plan.curve.length;
        if (dx < (source.width + 0.16 + opening.width) / 2 && bottom - 0.08 > opening.bottom && bottom - 0.28 < opening.bottom + opening.height)
          bottom = Math.min(bottom, opening.bottom + 0.06);
      }
      return { ...d, provenance, at, bottom };
    }
    if (!override.position) return d;
    const [x, z] = placeShapePoint(p, override.position), roof = createShapeRoofSurface(plan);
    if (!pointInShape([x, z], plan.topBoundary)) return d;
    const base = roof.heightAt(x, z) - 0.14;
    return { ...d, provenance, position: [x, base, z], top: base + (d.top - d.position[1]) };
  }) };
}
