import { RegionalRenderCostModel, addRenderCost, effectiveRenderCost, emptyRenderCost } from './RegionalRenderCost.js';
import { PerfCounters } from './qa/PerfCounters.js';
import { chunkRingDistance, collectRegionalSceneryDemand, sceneryChunkKey } from './RegionalSceneryDemand.js';

export function evaluateSceneryDemand(cells, previous, settings, geometryCosts = false) {
  const pressured = new Set();
  let maxUnits = 0;
  let totalUnits = 0;
  const totals = {};
  const requestedCost = emptyRenderCost(), selectedCost = emptyRenderCost();
  const layerCosts = {};
  let peakTriangles = 0, peakDraws = 0, fallbackChunks = 0;
  for (const [key, demand] of cells) {
    let units = 0;
    for (const [kind, count] of Object.entries(demand)) {
      if (kind === 'renderCost') continue;
      units += count * (settings.spatialWeights[kind] ?? 0);
      totals[kind] = (totals[kind] ?? 0) + count;
    }
    maxUnits = Math.max(maxUnits, units);
    totalUnits += units;
    const ratio = previous.has(key) ? settings.recoveryRatio : 1;
    let pressure = units > settings.spatialChunkBudget * ratio;
    if (geometryCosts && demand.renderCost) {
      const { requested, selected } = demand.renderCost;
      addRenderCost(requestedCost, requested);
      addRenderCost(selectedCost, selected);
      for (const [kind, cost] of Object.entries(demand.renderCost.layers ?? {})) {
        const layer = layerCosts[kind] ??= { requested: emptyRenderCost(), selected: emptyRenderCost() };
        addRenderCost(layer.requested, cost.requested);
        addRenderCost(layer.selected, cost.selected);
      }
      // Town tier selection is independent of spatial pressure. Reserve its current
      // published cost instead of charging every distant building at the near tier.
      const town = demand.renderCost.layers?.town;
      const pressureCost = { ...requested };
      if (town && town.selected.unknown === 0) {
        for (const field of Object.keys(pressureCost)) {
          pressureCost[field] = Math.max(0, pressureCost[field] - town.requested[field] + town.selected[field]);
        }
      }
      const effective = effectiveRenderCost(pressureCost, settings.spatialReflectionPassWeight);
      peakTriangles = Math.max(peakTriangles, effective.triangles);
      peakDraws = Math.max(peakDraws, effective.draws);
      const fallback = pressureCost.unknown > 0;
      if (fallback) fallbackChunks++;
      pressure = effective.triangles > settings.spatialTriangleBudget * ratio
        || effective.draws > settings.spatialDrawBudget * ratio || (fallback && pressure);
    } else if (geometryCosts) fallbackChunks++;
    if (pressure) pressured.add(key);
  }
  return { pressured, maxUnits, totalUnits, totals, requestedCost, selectedCost, peakTriangles, peakDraws, fallbackChunks, layerCosts };
}

function sameKeys(a, b) {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

/** Sample in bounded slices, publish only a complete demand estimate. */
export class RegionalSceneryBudget {
  constructor(settings, { geometryCosts = false } = {}) {
    this.settings = settings;
    this.geometryCosts = geometryCosts;
    this.costModel = null;
    this.townCache = new WeakMap();
    this.pressured = new Set();
    this.revision = 0;
    this.nextSample = 0;
    this.job = null;
    this.sampleWindow = null;
  }

  update(surface, now, shouldYield = () => false) {
    const focus = surface.terrainView.focusChunk;
    const size = surface.terrainView.chunkWorldSize;
    if (!focus || !(size > 0)) return;
    const window = this.job ?? this.sampleWindow;
    if (window && (window.size !== size
      || chunkRingDistance(focus.chunkX, focus.chunkZ, window.focus) > this.settings.spatialChunkRadius / 2)) {
      if (this.job) PerfCounters.inc('regionalSpatialSamplesCancelled');
      this.job = null;
      this.sampleWindow = null;
      this.nextSample = now;
      this.publish(new Set());
    }
    if (!this.job && now >= this.nextSample) {
      const anchor = { chunkX: focus.chunkX, chunkZ: focus.chunkZ };
      if (this.geometryCosts) {
        this.costModel ??= new RegionalRenderCostModel(surface);
        this.costModel.refreshPasses();
      }
      this.job = { focus: anchor, size,
        iterator: collectRegionalSceneryDemand(surface, anchor, size, this.settings, this.townCache, this.costModel) };
    }
    if (!this.job) return;
    for (let i = 0; i < this.settings.spatialWorkItems && !shouldYield(); i++) {
      const step = this.job.iterator.next();
      if (!step.done) continue;
      const result = evaluateSceneryDemand(step.value, this.pressured, this.settings, this.geometryCosts);
      this.publish(result.pressured);
      PerfCounters.set('regionalSpatialSampledChunks', step.value.size);
      PerfCounters.set('regionalSpatialDemandUnits', result.totalUnits);
      PerfCounters.set('regionalSpatialPeakChunkUnits', result.maxUnits);
      for (const kind of Object.keys(this.settings.spatialWeights)) {
        PerfCounters.set(`regionalSpatialDemand.${kind}`, result.totals[kind] ?? 0);
      }
      if (this.geometryCosts) {
        for (const [key, value] of Object.entries(result.requestedCost)) PerfCounters.set(`regionalCostRequested.${key}`, value);
        for (const [key, value] of Object.entries(result.selectedCost)) PerfCounters.set(`regionalCostSelected.${key}`, value);
        PerfCounters.set('regionalCostPeakEffectiveTriangles', result.peakTriangles);
        PerfCounters.set('regionalCostPeakEffectiveDraws', result.peakDraws);
        PerfCounters.set('regionalCostFallbackChunks', result.fallbackChunks);
        for (const kind of Object.keys(this.settings.spatialWeights)) {
          for (const phase of ['requested', 'selected']) {
            const cost = result.layerCosts[kind]?.[phase];
            PerfCounters.set(`regionalCost.${kind}.${phase}.triangles`, cost?.triangles ?? 0);
            PerfCounters.set(`regionalCost.${kind}.${phase}.draws`, cost?.draws ?? 0);
          }
        }
      }
      PerfCounters.inc('regionalSpatialSamples');
      this.sampleWindow = { focus: this.job.focus, size: this.job.size };
      this.job = null;
      this.nextSample = now + this.settings.sampleIntervalMs;
      break;
    }
  }

  publish(next) {
    if (!sameKeys(this.pressured, next)) {
      this.pressured = next;
      this.revision++;
    }
    PerfCounters.set('regionalSpatialPressuredChunks', this.pressured.size);
  }

  factorForKey(key) {
    return this.pressured.has(key) ? this.settings.spatialLodFactor : 1;
  }

  /** Trim only fully distant card tiles, never the blade/card overlap or protected rings. */
  cardFactor(x, z, halfSize, focus, cameraChunk, chunkSize, handoffEnd) {
    const key = sceneryChunkKey(x, z, chunkSize);
    if (!this.pressured.has(key)) return 1;
    const cx = Math.floor(x / chunkSize), cz = Math.floor(-z / chunkSize);
    const minX = cx * chunkSize, maxX = minX + chunkSize;
    const maxZ = -cz * chunkSize, minZ = maxZ - chunkSize;
    if (x - halfSize < minX || x + halfSize > maxX || z - halfSize < minZ || z + halfSize > maxZ) return 1;
    const radius = this.settings.protectedChunkRadius;
    if (chunkRingDistance(cx, cz, focus) <= radius || chunkRingDistance(cx, cz, cameraChunk) <= radius) return 1;
    const cameraMinX = cameraChunk.chunkX * chunkSize, cameraMaxX = cameraMinX + chunkSize;
    const cameraMaxZ = -cameraChunk.chunkZ * chunkSize, cameraMinZ = cameraMaxZ - chunkSize;
    const dx = Math.max(cameraMinX - x - halfSize, x - halfSize - cameraMaxX, 0);
    const dz = Math.max(cameraMinZ - z - halfSize, z - halfSize - cameraMaxZ, 0);
    if (dx * dx + dz * dz <= handoffEnd * handoffEnd) return 1;
    return this.settings.spatialCardFactor;
  }

  dispose() {
    this.job = null;
    this.sampleWindow = null;
    this.costModel = null;
    this.townCache = new WeakMap();
    this.publish(new Set());
  }
}
