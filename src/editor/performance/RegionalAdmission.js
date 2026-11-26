import { effectiveRenderCost } from './RegionalRenderCost.js';

export const ADMISSION_LAYERS = Object.freeze(['tree', 'rock', 'bush', 'card']);
const zero = () => ({ triangles: 0, draws: 0 });
const add = (a, b) => ({ triangles: a.triangles + b.triangles, draws: a.draws + b.draws });
const fits = (cost, limit) => cost.triangles <= limit.triangles && cost.draws <= limit.draws;
const known = cost => cost && cost.unknown === 0
  && Number.isFinite(cost.triangles) && Number.isFinite(cost.draws)
  && Number.isFinite(cost.shadowTriangles) && Number.isFinite(cost.shadowDraws)
  && Number.isFinite(cost.reflectionTriangles) && Number.isFinite(cost.reflectionDraws);

/** Card tiles must fit entirely outside both protected rings and the handoff. */
export function regionalCardEligible(x, z, halfSize, focus, cameraChunk, chunkSize, handoffEnd, radius) {
  if (!focus || !cameraChunk || !(chunkSize > 0) || !Number.isFinite(handoffEnd)) return false;
  const cx = Math.floor(x / chunkSize), cz = Math.floor(-z / chunkSize);
  const minX = cx * chunkSize, maxX = minX + chunkSize;
  const maxZ = -cz * chunkSize, minZ = maxZ - chunkSize;
  if (x - halfSize < minX || x + halfSize > maxX || z - halfSize < minZ || z + halfSize > maxZ) return false;
  const ring = point => Math.max(Math.abs(cx - point.chunkX), Math.abs(cz - point.chunkZ));
  if (ring(focus) <= radius || ring(cameraChunk) <= radius) return false;
  const cameraMinX = cameraChunk.chunkX * chunkSize, cameraMaxX = cameraMinX + chunkSize;
  const cameraMaxZ = -cameraChunk.chunkZ * chunkSize, cameraMinZ = cameraMaxZ - chunkSize;
  const dx = Math.max(cameraMinX - x - halfSize, x - halfSize - cameraMaxX, 0);
  const dz = Math.max(cameraMinZ - z - halfSize, z - halfSize - cameraMaxZ, 0);
  return dx * dx + dz * dz > handoffEnd * handoffEnd;
}

/** Reserve fixed layers and minimum visible representations, then admit upgrades. */
export function allocateRegionalCell(layers, settings, previous = null) {
  const weight = settings.spatialReflectionPassWeight;
  const limit = { triangles: settings.spatialTriangleBudget, draws: settings.spatialDrawBudget };
  let reserved = zero(), requested = zero(), unknown = false;
  const choices = new Map(), candidates = [];
  for (const [kind, layer] of Object.entries(layers)) {
    const fixed = kind === 'town' && known(layer.selected) ? layer.selected : layer.requested;
    const cost = effectiveRenderCost(fixed, weight);
    requested = add(requested, cost);
    if (!known(fixed)) unknown = true;
    const options = ADMISSION_LAYERS.includes(kind) && layer.options?.length
      && layer.options[0].factor === 1 && layer.options.every(option => known(option.cost))
      ? layer.options.map(option => ({ factor: option.factor, cost: effectiveRenderCost(option.cost, weight) })) : null;
    if (!options || !known(fixed)) {
      reserved = add(reserved, cost);
      continue;
    }
    // Keep only options no more expensive than every finer retained tier in either dimension.
    const useful = [options[0]];
    for (const option of options.slice(1)) {
      const finer = useful[useful.length - 1].cost;
      if (fits(option.cost, finer) && (option.cost.triangles < finer.triangles || option.cost.draws < finer.draws)) useful.push(option);
    }
    const minimum = useful[useful.length - 1];
    reserved = add(reserved, minimum.cost);
    choices.set(kind, minimum);
    candidates.push({ kind, options: useful });
  }
  if (unknown) return { factors: {}, requested, admitted: requested, reserved, unknown: true, overflow: !fits(requested, limit) };
  if (fits(requested, limit) && !previous) return { factors: {}, requested, admitted: requested, reserved, unknown: false, overflow: false };
  let admitted = reserved;
  // Previous pressure uses the lower recovery threshold only for quality increases.
  const recovery = { triangles: limit.triangles * settings.recoveryRatio, draws: limit.draws * settings.recoveryRatio };
  candidates.sort((a, b) => settings.admissionPriorities[b.kind] - settings.admissionPriorities[a.kind]
    || ADMISSION_LAYERS.indexOf(a.kind) - ADMISSION_LAYERS.indexOf(b.kind));
  for (const { kind, options } of candidates) {
    const minimum = choices.get(kind);
    const currentFactor = previous?.[kind] ?? 1;
    for (const option of options) {
      const next = { triangles: admitted.triangles - minimum.cost.triangles + option.cost.triangles,
        draws: admitted.draws - minimum.cost.draws + option.cost.draws };
      if (!fits(next, option.factor > currentFactor ? recovery : limit)) continue;
      admitted = next;
      choices.set(kind, option);
      break;
    }
  }
  const factors = {};
  for (const [kind, option] of choices) if (option.factor < 1) factors[kind] = option.factor;
  return { factors, requested, admitted, reserved, unknown: false, overflow: !fits(admitted, limit) };
}

export function* iterateRegionalWindow(cells, settings, previous, focus, cameraChunk) {
  const decisions = new Map();
  const stats = { chunks: 0, reducedChunks: 0, overflowChunks: 0, unknownChunks: 0,
    requestedTriangles: 0, admittedTriangles: 0, requestedDraws: 0, admittedDraws: 0,
    reservedTriangles: 0, reservedDraws: 0, protectedChunks: 0, treeReduced: 0, rockReduced: 0, bushReduced: 0, cardReduced: 0 };
  for (const [key, cell] of cells) {
    const layers = cell.renderCost?.layers;
    if (!layers) { stats.unknownChunks++; yield; continue; }
    const [x, z] = key.split(':').map(Number);
    const protectedCell = [focus, cameraChunk].some(point => point
      && Math.max(Math.abs(x - point.chunkX), Math.abs(z - point.chunkZ)) <= settings.protectedChunkRadius);
    const result = allocateRegionalCell(protectedCell || !cameraChunk
      ? Object.fromEntries(Object.entries(layers).map(([kind, layer]) => [kind, { ...layer, options: null }]))
      : layers, settings, previous.get(key));
    stats.chunks++;
    if (protectedCell || !cameraChunk) stats.protectedChunks++;
    if (result.unknown) stats.unknownChunks++;
    if (result.overflow) stats.overflowChunks++;
    stats.requestedTriangles += result.requested.triangles;
    stats.admittedTriangles += result.admitted.triangles;
    stats.requestedDraws += result.requested.draws;
    stats.admittedDraws += result.admitted.draws;
    stats.reservedTriangles += result.reserved.triangles;
    stats.reservedDraws += result.reserved.draws;
    if (Object.keys(result.factors).length) {
      decisions.set(key, result.factors);
      stats.reducedChunks++;
      for (const kind of Object.keys(result.factors)) stats[`${kind}Reduced`]++;
    }
    yield;
  }
  return { decisions, stats };
}

export function allocateRegionalWindow(...args) {
  const iterator = iterateRegionalWindow(...args);
  let step;
  do { step = iterator.next(); } while (!step.done);
  return step.value;
}
