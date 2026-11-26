import { effectiveRenderCost } from '../RegionalRenderCost.js';

export const SPATIAL_LAYERS = Object.freeze(['all', 'tree', 'rock', 'bush', 'blade', 'card', 'detail', 'town', 'water']);
export const SPATIAL_METRICS = Object.freeze(['pressure', 'requestedTriangles', 'selectedTriangles', 'requestedDraws', 'selectedDraws', 'units']);
const ring = (x, z, point) => point ? Math.max(Math.abs(x - point.chunkX), Math.abs(z - point.chunkZ)) : Infinity;

export function spatialCell(sample, key, layer = 'all') {
  const demand = sample.cells.get(key);
  if (!demand) return null;
  const [x, z] = key.split(':').map(Number);
  const counts = Object.fromEntries(Object.entries(demand).filter(([kind]) => kind !== 'renderCost'));
  const weights = sample.settings.spatialWeights;
  const units = layer === 'all' ? Object.entries(counts).reduce((sum, [kind, count]) => sum + count * (weights[kind] ?? 0), 0)
    : (counts[layer] ?? 0) * (weights[layer] ?? 0);
  const cost = layer === 'all' ? demand.renderCost : demand.renderCost?.layers?.[layer];
  const requested = cost?.requested, selected = cost?.selected;
  const factors = sample.decisions.get(key) ?? {};
  const protectedCell = sample.admission && (!sample.cameraChunk || [sample.focus, sample.cameraChunk]
    .some(point => ring(x, z, point) <= sample.settings.protectedChunkRadius));
  const reduced = sample.admission ? (layer === 'all' ? Object.values(factors).some(factor => factor < 1) : (factors[layer] ?? 1) < 1)
    : !sample.observeOnly && sample.pressured.has(key);
  const localPressure = sample.localPressure.has(key);
  const effective = requested ? effectiveRenderCost(requested, sample.settings.spatialReflectionPassWeight) : null;
  const reasons = [];
  if (sample.observeOnly) reasons.push('Observe only; no quality reductions applied');
  if (protectedCell) reasons.push('Protected focus/camera ring');
  if (requested?.unknown || selected?.unknown || !cost) reasons.push('Incomplete geometry estimate');
  if (localPressure) reasons.push('Local demand pressure (whole cell)');
  if (reduced) reasons.push(sample.rendererAdmission ? 'Renderer admission factor reduced' : sample.admission ? 'Regional admission factor reduced' : 'Spatial pressure signal; eligible layers only');
  if (!reasons.length) reasons.push('No reported local pressure or reduction');
  return { key, x, z, units, counts, requested: requested ?? null, selected: selected ?? null,
    effective, factors: { ...factors }, protected: Boolean(protectedCell), reduced, localPressure, reasons };
}

export function spatialMetric(cell, metric, settings) {
  if (!cell) return null;
  switch (metric) {
    case 'pressure': return cell.effective ? Math.max(cell.effective.triangles / settings.spatialTriangleBudget, cell.effective.draws / settings.spatialDrawBudget) : cell.units / settings.spatialChunkBudget;
    case 'requestedTriangles': return cell.requested?.triangles ?? null;
    case 'selectedTriangles': return cell.selected?.triangles ?? null;
    case 'requestedDraws': return cell.requested?.draws ?? null;
    case 'selectedDraws': return cell.selected?.draws ?? null;
    case 'units': return cell.units;
    default: return null;
  }
}

export function spatialMetricLimit(metric, settings) {
  if (metric === 'pressure') return 1;
  if (metric.endsWith('Triangles')) return settings.spatialTriangleBudget;
  if (metric.endsWith('Draws')) return settings.spatialDrawBudget;
  return settings.spatialChunkBudget;
}

export function spatialWindow(sample, radius, layer, metric) {
  const cells = [];
  for (let z = sample.focus.chunkZ - radius; z <= sample.focus.chunkZ + radius; z++) {
    for (let x = sample.focus.chunkX - radius; x <= sample.focus.chunkX + radius; x++) {
      const cell = spatialCell(sample, `${x}:${z}`, layer);
      cells.push({ x, z, cell, value: spatialMetric(cell, metric, sample.settings) });
    }
  }
  return cells;
}

export function spatialExport(sample) {
  return { version: 1, timestampMs: sample.timestamp, startedAtMs: sample.startedAt ?? sample.timestamp, focus: sample.focus, cameraChunk: sample.cameraChunk,
    chunkWorldSize: sample.size, observeOnly: sample.observeOnly, geometryCosts: sample.geometryCosts,
    admission: sample.admission, rendererAdmission: sample.rendererAdmission, settings: sample.settings,
    allocationStats: sample.allocationStats, cells: [...sample.cells.keys()].map(key => {
      const cell = spatialCell(sample, key);
      return { ...cell, layers: sample.cells.get(key).renderCost?.layers ?? {} };
    }) };
}
