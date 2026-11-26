import { ADMISSION_LAYERS, iterateRegionalWindow } from './RegionalAdmission.js';
import { effectiveRenderCost } from './RegionalRenderCost.js';

const zero = () => ({ triangles: 0, draws: 0 });
const add = (a, b) => ({ triangles: a.triangles + b.triangles, draws: a.draws + b.draws });
const subtract = (a, b) => ({ triangles: a.triangles - b.triangles, draws: a.draws - b.draws });
const positive = cost => ({ triangles: Math.max(0, cost.triangles), draws: Math.max(0, cost.draws) });
const scale = (cost, factor) => ({ triangles: cost.triangles * factor, draws: cost.draws * factor });
const fits = (cost, limit) => cost.triangles <= limit.triangles && cost.draws <= limit.draws;
const known = cost => cost?.unknown === 0 && ['triangles', 'draws', 'shadowTriangles', 'shadowDraws',
  'reflectionTriangles', 'reflectionDraws'].every(key => Number.isFinite(cost[key]) && cost[key] >= 0);

function distance(key, focus, cameraChunk) {
  const [x, z] = key.split(':').map(Number);
  const ring = point => Math.max(Math.abs(x - point.chunkX), Math.abs(z - point.chunkZ));
  return Math.min(ring(focus), cameraChunk ? ring(cameraChunk) : Infinity);
}

function compareStable(a, b) {
  return (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || ADMISSION_LAYERS.indexOf(a.kind) - ADMISSION_LAYERS.indexOf(b.kind);
}

function optionsFor(layer, weight) {
  if (layer.options?.[0]?.factor !== 1 || !layer.options.every(option => known(option.cost))) return null;
  const result = [];
  for (const option of layer.options) {
    const cost = effectiveRenderCost(option.cost, weight);
    const finer = result.at(-1)?.cost;
    if (finer && (!fits(cost, finer) || (cost.triangles === finer.triangles && cost.draws === finer.draws))) continue;
    result.push({ factor: option.factor, cost, transition: known(option.transitionCost)
      ? effectiveRenderCost(option.transitionCost, weight) : null });
  }
  return result;
}

/** Allocate shared capacity across the sampled chunks, preserving local limits and mandatory reserves. */
export function* iterateRendererAdmission(cells, settings, previous, focus, cameraChunk) {
  const local = yield* iterateRegionalWindow(cells, settings, previous, focus, cameraChunk);
  const weight = settings.spatialReflectionPassWeight;
  const limit = { triangles: settings.rendererAdmissionTriangleBudget, draws: settings.rendererAdmissionDrawBudget };
  const steadyLimit = scale(limit, 1 - settings.rendererAdmissionTransitionReserve);
  let steady = zero(), active = zero(), fixed = zero(), overlap = zero(), unknownChunks = 0, unknownActiveChunks = 0;
  const records = [];
  for (const [key, cell] of cells) {
    const layers = cell.renderCost?.layers;
    const protectedCell = !cameraChunk || distance(key, focus, cameraChunk) <= settings.protectedChunkRadius;
    if (!layers) { unknownChunks++; unknownActiveChunks++; yield; continue; }
    const mandatory = Object.entries(layers).some(([kind, layer]) =>
      !known(kind === 'town' && known(layer.selected) ? layer.selected : layer.requested));
    if (mandatory) unknownChunks++;
    if (Object.values(layers).some(layer => !known(layer.active ?? layer.selected))) unknownActiveChunks++;
    for (const [kind, layer] of Object.entries(layers)) {
      const full = kind === 'town' && known(layer.selected) ? layer.selected : layer.requested;
      const fullCost = effectiveRenderCost(full, weight);
      const activeCost = known(layer.active) ? effectiveRenderCost(layer.active, weight)
        : known(layer.selected) ? effectiveRenderCost(layer.selected, weight) : fullCost;
      const currentCost = known(layer.current) ? effectiveRenderCost(layer.current, weight) : activeCost;
      overlap = add(overlap, positive(subtract(activeCost, currentCost)));
      active = add(active, activeCost);
      const options = !protectedCell && !mandatory && ADMISSION_LAYERS.includes(kind) ? optionsFor(layer, weight) : null;
      if (!options?.length) {
        const reserve = { triangles: Math.max(fullCost.triangles, currentCost.triangles), draws: Math.max(fullCost.draws, currentCost.draws) };
        steady = add(steady, reserve);
        fixed = add(fixed, reserve);
        continue;
      }
      const oldFactor = previous.get(key)?.[kind] ?? 1;
      const localFactor = local.decisions.get(key)?.[kind] ?? 1;
      const oldOption = layer.options.find(option => option.factor === oldFactor);
      const current = options.find(option => option.factor === oldFactor)
        ?? { factor: oldFactor, cost: known(oldOption?.cost) ? effectiveRenderCost(oldOption.cost, weight) : currentCost };
      const desired = options.find(option => option.factor === localFactor) ?? options[0];
      records.push({ key, kind, distance: distance(key, focus, cameraChunk), priority: settings.admissionPriorities[kind],
        current, desired, options, activeCost, activeKnown: known(layer.active ?? layer.selected) });
      steady = add(steady, desired.cost);
    }
    yield;
  }
  const localSteady = steady;
  records.sort((a, b) => a.priority - b.priority || b.distance - a.distance || compareStable(a, b));
  for (const record of records) {
    if (fits(steady, steadyLimit)) break;
    const alternatives = record.options.filter(option => option.factor < record.desired.factor);
    if (!alternatives.length) { yield; continue; }
    const base = subtract(steady, record.desired.cost);
    const choice = alternatives.find(option => fits(add(base, option.cost), steadyLimit)) ?? alternatives.at(-1);
    record.desired = choice;
    steady = add(base, choice.cost);
    yield;
  }
  return { local, records, fixed, active, overlap, steady, localSteady, limit, steadyLimit, unknownChunks, unknownActiveChunks };
}

/** Select bounded changes against transition overlap and the live upload allowance. */
export function finalizeRendererAdmission(plan, settings, publication = {}) {
  const { records, active, limit, steadyLimit } = plan;
  const decisions = new Map();
  let admitted = plan.fixed;
  let transient = active;
  let changes = 0, deferred = 0, uploadDeferred = 0, overlapDeferred = 0, unknownDeferred = 0, emergencyDemotions = 0;
  const contended = publication.contended === true;
  const busy = publication.busy === true;
  const changeLimit = contended || busy ? Math.min(1, settings.rendererAdmissionMaxChanges) : settings.rendererAdmissionMaxChanges;
  const recovery = scale(steadyLimit, settings.recoveryRatio);
  // Establish the current estimated steady state before granting upgrades.
  for (const record of records) admitted = add(admitted, record.current.cost);
  const overlap = plan.overlap;
  const changed = records.filter(record => record.current.factor !== record.desired.factor);
  changed.sort((a, b) => {
    const ad = a.desired.factor < a.current.factor, bd = b.desired.factor < b.current.factor;
    if (ad !== bd) return ad ? -1 : 1;
    return ad ? a.priority - b.priority || b.distance - a.distance || compareStable(a, b)
      : b.priority - a.priority || a.distance - b.distance || compareStable(a, b);
  });
  const granted = new Set();
  for (const record of changed) {
    const promotion = record.desired.factor > record.current.factor;
    const nextSteady = add(subtract(admitted, record.current.cost), record.desired.cost);
    if (promotion && (contended || busy)) { uploadDeferred++; deferred++; continue; }
    if (promotion && (plan.unknownChunks || plan.unknownActiveChunks)) { unknownDeferred++; deferred++; continue; }
    if (changes >= changeLimit || emergencyDemotions > 0 || (promotion && !fits(nextSteady, recovery))) { deferred++; continue; }
    // Candidate union includes the currently selected and target bands. No credit
    // for retiring geometry until a later completed sample observes the retirement.
    const extra = record.activeKnown && record.desired.transition ? positive(subtract(record.desired.transition, record.activeCost)) : null;
    const nextTransient = extra && add(transient, extra);
    const noAddedOverlap = extra && extra.triangles === 0 && extra.draws === 0;
    if (!nextTransient || (!fits(nextTransient, limit) && (promotion || !noAddedOverlap))) {
      // An already over-budget view must be able to demote, but never start a
      // batch of oversized transitions or bypass unknown overlap estimates.
      if (promotion || !nextTransient || contended || changes > 0 || overlap.triangles > 0 || overlap.draws > 0) {
        overlapDeferred++; deferred++; continue;
      }
      emergencyDemotions++;
    }
    transient = nextTransient;
    admitted = nextSteady;
    granted.add(record);
    changes++;
  }
  for (const record of records) {
    const factor = granted.has(record) ? record.desired.factor : record.current.factor;
    if (factor >= 1) continue;
    let cell = decisions.get(record.key);
    if (!cell) decisions.set(record.key, cell = {});
    cell[record.kind] = factor;
  }
  return { decisions, stats: {
    chunks: plan.local.stats.chunks, unknownChunks: plan.unknownChunks, unknownActiveChunks: plan.unknownActiveChunks,
    localTriangles: plan.localSteady.triangles, localDraws: plan.localSteady.draws,
    targetTriangles: plan.steady.triangles, targetDraws: plan.steady.draws,
    admittedTriangles: admitted.triangles, admittedDraws: admitted.draws,
    activeTriangles: active.triangles, activeDraws: active.draws,
    overlapTriangles: overlap.triangles, overlapDraws: overlap.draws,
    transientTriangles: transient.triangles, transientDraws: transient.draws,
    fixedTriangles: plan.fixed.triangles, fixedDraws: plan.fixed.draws,
    steadyTriangleLimit: steadyLimit.triangles, steadyDrawLimit: steadyLimit.draws,
    reducedChunks: decisions.size, changes, deferred, uploadDeferred, overlapDeferred, unknownDeferred, emergencyDemotions,
    targetOverflow: Number(!fits(plan.steady, steadyLimit)),
    admittedOverflow: Number(!fits(admitted, steadyLimit)),
    transientOverflow: Number(!fits(transient, limit)),
    uploadContended: Number(contended), publicationBusy: Number(busy), remainingUploadBytes: publication.remainingBytes ?? -1,
  } };
}

export function rendererPublicationState(surface, settings) {
  const budget = surface.publicationBudget;
  const remaining = budget?.remainingUploadBytes?.();
  const maximum = budget?.maxUploadBytes;
  const measured = Number.isFinite(remaining) && Number.isFinite(maximum) && maximum > 0;
  const busy = [surface.treeView, surface.rockView, surface.bushView].some(view =>
    view?.stagedRebuild || view?.pendingLodRebuild || view?.pendingRebuild);
  return { remainingBytes: measured ? remaining : -1, busy,
    contended: measured && remaining < maximum * settings.rendererAdmissionUploadHeadroom };
}
