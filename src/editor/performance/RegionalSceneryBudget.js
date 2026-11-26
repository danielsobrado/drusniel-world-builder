import { iterateRendererAdmission, finalizeRendererAdmission, rendererPublicationState } from './RendererAdmission.js';
import { iterateRegionalWindow, regionalCardEligible } from './RegionalAdmission.js';
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

function sameDecisions(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, factors] of a) {
    const next = b.get(key);
    if (!next || Object.keys(factors).length !== Object.keys(next).length
      || Object.entries(factors).some(([kind, factor]) => next[kind] !== factor)) return false;
  }
  return true;
}

/** Sample in bounded slices, publish only a complete demand estimate. */
export class RegionalSceneryBudget {
  constructor(settings, { geometryCosts = false, admission = false, rendererAdmission = false, captureDiagnostics = false, observeOnly = false } = {}) {
    this.settings = settings;
    this.captureDiagnostics = captureDiagnostics || observeOnly;
    this.observeOnly = observeOnly;
    this.diagnosticSample = null;
    this.geometryCosts = geometryCosts || admission || rendererAdmission;
    this.admission = admission || rendererAdmission;
    this.rendererAdmission = rendererAdmission;
    this.decisions = new Map();
    this.costModel = null;
    this.townCache = new WeakMap();
    this.pressured = new Set();
    this.revision = 0;
    this.nextSample = 0;
    this.job = null;
    this.sampleWindow = null;
  }

  update(surface, now, shouldYield = () => false, camera = null) {
    const focus = surface.terrainView.focusChunk;
    const size = surface.terrainView.chunkWorldSize;
    if (!focus || !(size > 0)) return;
    const origin = (this.admission || this.captureDiagnostics) && camera ? surface.terrainView.floatingOrigin?.getState() : null;
    const cameraChunk = origin ? { chunkX: Math.floor((camera.position.x + origin.x) / size),
      chunkZ: Math.floor(-(camera.position.z + origin.z) / size) } : null;
    const window = this.job ?? this.sampleWindow;
    const cameraMoved = this.admission && window && (
      Boolean(cameraChunk) !== Boolean(window.cameraChunk)
      || (cameraChunk && window.cameraChunk && chunkRingDistance(cameraChunk.chunkX, cameraChunk.chunkZ, window.cameraChunk) > this.settings.spatialChunkRadius / 2));
    if (window && (window.size !== size || cameraMoved
      || chunkRingDistance(focus.chunkX, focus.chunkZ, window.focus) > this.settings.spatialChunkRadius / 2)) {
      if (this.job) PerfCounters.inc('regionalSpatialSamplesCancelled');
      this.job = null;
      this.sampleWindow = null;
      this.diagnosticSample = null;
      this.nextSample = now;
      if (!this.observeOnly) this.publish(new Set(), new Map());
    }
    if (!this.job && now >= this.nextSample) {
      const anchor = { chunkX: focus.chunkX, chunkZ: focus.chunkZ };
      if (this.geometryCosts) {
        this.costModel ??= new RegionalRenderCostModel(surface);
        this.costModel.refreshPasses();
      }
      const admissionContext = this.admission ? { cameraChunk, handoffEnd: surface.meadowGrass?.uniforms?.cardFadeIn?.value?.y,
        rendererAdmission: this.rendererAdmission } : null;
      this.job = { focus: anchor, size, cameraChunk,
        iterator: collectRegionalSceneryDemand(surface, anchor, size, this.settings, this.townCache, this.costModel, admissionContext) };
    }
    if (!this.job) return;
    for (let i = 0; i < this.settings.spatialWorkItems && !shouldYield(); i++) {
      const step = this.job.iterator.next();
      if (!step.done) continue;
      if (this.admission && !this.job.cells) {
        this.job.cells = step.value;
        const allocate = this.rendererAdmission ? iterateRendererAdmission : iterateRegionalWindow;
        this.job.iterator = allocate(step.value, this.settings, this.decisions, this.job.focus, this.job.cameraChunk);
        continue;
      }
      const cells = this.job.cells ?? step.value;
      const result = evaluateSceneryDemand(cells, this.pressured, this.settings, this.geometryCosts);
      let allocationStats = null;
      if (this.admission) {
        const allocation = this.rendererAdmission
          ? finalizeRendererAdmission(step.value, this.settings, rendererPublicationState(surface, this.settings)) : step.value;
        this.publish(new Set(allocation.decisions.keys()), allocation.decisions);
        allocationStats = allocation.stats;
        const prefix = this.rendererAdmission ? 'rendererAdmission' : 'regionalAdmission';
        for (const [key, value] of Object.entries(allocation.stats)) PerfCounters.set(`${prefix}.${key}`, value);
      } else if (!this.observeOnly) this.publish(result.pressured);
      if (this.captureDiagnostics) {
        this.diagnosticSample = { cells, timestamp: now, focus: this.job.focus, cameraChunk: this.job.cameraChunk,
          size, geometryCosts: this.geometryCosts, admission: this.admission, rendererAdmission: this.rendererAdmission,
          observeOnly: this.observeOnly, pressured: this.pressured, localPressure: result.pressured,
          decisions: this.decisions, allocationStats, settings: this.settings };
      }
      if (this.observeOnly) {
        this.sampleWindow = { focus: this.job.focus, size: this.job.size, cameraChunk: this.job.cameraChunk };
        this.job = null;
        this.nextSample = now + this.settings.sampleIntervalMs;
        break;
      }
      PerfCounters.set('regionalSpatialSampledChunks', cells.size);
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
      this.sampleWindow = { focus: this.job.focus, size: this.job.size, cameraChunk: this.job.cameraChunk };
      this.job = null;
      this.nextSample = now + this.settings.sampleIntervalMs;
      break;
    }
  }

  publish(next, decisions = this.decisions) {
    const changed = !sameKeys(this.pressured, next) || (this.admission && !sameDecisions(this.decisions, decisions));
    this.pressured = next;
    this.decisions = decisions;
    if (changed) this.revision++;
    PerfCounters.set('regionalSpatialPressuredChunks', this.pressured.size);
  }

  factorForKey(key, layer = null) {
    if (this.admission) return this.decisions.get(key)?.[layer] ?? 1;
    return this.pressured.has(key) ? this.settings.spatialLodFactor : 1;
  }

  /** Trim only fully distant card tiles, never the blade/card overlap or protected rings. */
  cardFactor(x, z, halfSize, focus, cameraChunk, chunkSize, handoffEnd) {
    const key = sceneryChunkKey(x, z, chunkSize);
    if (!this.pressured.has(key)) return 1;
    if (!regionalCardEligible(x, z, halfSize, focus, cameraChunk, chunkSize, handoffEnd, this.settings.protectedChunkRadius)) return 1;
    return this.admission ? this.factorForKey(key, 'card') : this.settings.spatialCardFactor;
  }

  dispose() {
    this.job = null;
    this.sampleWindow = null;
    this.costModel = null;
    this.diagnosticSample = null;
    this.townCache = new WeakMap();
    if (!this.observeOnly) this.publish(new Set(), new Map());
  }
}
