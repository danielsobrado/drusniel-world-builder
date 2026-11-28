const LAYERS = Object.freeze({ tree: 'treeView', rock: 'rockView', bush: 'bushView' });
const INTERVAL_MS = 100;
const MAX_SAMPLES = 1200;

export const LOD_BASELINE_COUNTERS = Object.freeze([
  'sceneryLodHandoffDeferred', 'sceneryLodHandoffDrawsReady',
  'sceneryLodHandoffTimeouts', 'sceneryLodHandoffAbandonedDraws',
  'stylizedInstancesDroppedByCapacity', 'sceneryPublicationCommits',
  'sceneryPublicationQueuedBytes', 'scenerySliceUploadedBytes',
  'scenerySliceGpuCopyBytes', 'initialInstanceSlicedBytes',
  'attributeBytesUploaded', 'stylizedInstanceRowsCompared', 'sceneryDitherQueuedBytes',
  'sceneryLodHandoffLeaseMs', 'sceneryLodHandoffLeases', 'sceneryDitherGpuCopyBytes',
  'treeManifestReadyLatencyTotalMs', 'treeManifestReadyCount',
]);

function describe(state, now) {
  const bands = state.representations?.filter(rep => rep.band !== 'culled' && rep.fade > Number.EPSILON)
    .map(rep => rep.band) ?? [];
  const pending = Boolean(state.waitingForData);
  return { target: state.target, bands, pending, transitioning: !state.complete && !pending,
    overlap: bands.length > 1, ageMs: Number.isFinite(state.startedAt) ? Math.max(0, now - state.startedAt) : null };
}

/** Planner state, not proof of published draws or pixel coverage. */
export function lodCellDiagnostics(surface, key, now) {
  return Object.fromEntries(Object.entries(LAYERS).map(([layer, property]) => {
    const state = surface?.[property]?.chunkLodStates?.get(key);
    return [layer, state ? describe(state, now) : null];
  }));
}

export function sampleLodPlans(surface, now, previous = new Map()) {
  const layers = {}, next = new Map();
  for (const [layer, property] of Object.entries(LAYERS)) {
    const states = surface?.[property]?.chunkLodStates;
    if (!(states instanceof Map)) { layers[layer] = null; continue; }
    const result = { chunks: states.size, transitioning: 0, overlapping: 0, pendingData: 0,
      maxPendingDataAgeMs: null, observedReversals: 0, targets: {} };
    for (const [key, state] of states) {
      const id = layer + ':' + key;
      const old = previous.get(id);
      if (old && !old.complete && !old.waitingForData && old.from !== old.target
        && state.target === old.from && state.target !== old.target) result.observedReversals++;
      next.set(id, state);
      result.targets[state.target] = (result.targets[state.target] ?? 0) + 1;
      if (!state.complete && !state.waitingForData) result.transitioning++;
      let visibleBands = 0;
      for (const rep of state.representations ?? []) {
        if (rep.band !== 'culled' && rep.fade > Number.EPSILON) visibleBands++;
      }
      if (visibleBands > 1) result.overlapping++;
      if (state.waitingForData) {
        result.pendingData++;
        if (Number.isFinite(state.startedAt)) result.maxPendingDataAgeMs = Math.max(result.maxPendingDataAgeMs ?? 0, now - state.startedAt, 0);
      }
    }
    layers[layer] = result;
  }
  return { layers, next };
}

export class LodBaselineDiagnostics {
  constructor() { this.reset(); }
  reset() {
    this.previous = new Map();
    this.samples = [];
    this.nextAt = -Infinity;
    this.dropped = 0;
  }
  sample(surface, now, frameIndex) {
    if (now < this.nextAt) return;
    this.nextAt = now + INTERVAL_MS;
    if (this.samples.length >= MAX_SAMPLES) { this.dropped++; return; }
    const start = performance.now();
    const { layers, next } = sampleLodPlans(surface, now, this.previous);
    this.previous = next;
    const info = surface?.terrainView?.renderer?.info;
    const sample = { frameIndex, timestampMs: now, layers,
      rendererAccountedBytes: Number.isFinite(info?.memory?.total) ? info.memory.total : null,
      samplingCpuMs: performance.now() - start };
    this.samples.push(sample);
  }
  report(frames) {
    const counters = {};
    for (const key of LOD_BASELINE_COUNTERS) {
      let present = false, total = 0;
      for (const frame of frames) {
        const delta = frame.countersDelta?.[key];
        if (Number.isFinite(delta)) { present = true; total += delta; }
      }
      counters[key] = present ? total : null;
    }
    return { version: 1, sampleIntervalMs: INTERVAL_MS, droppedSamples: this.dropped,
      scope: 'planned exterior scenery chunks; not published geometry', counters,
      unavailable: ['transitionExtraTriangles', 'transitionExtraDraws', 'transitionPinnedBytes',
        'fadeOnlyUploadBytes', 'gpuReadinessAgeMs', 'visibleMissingCoverage'],
      samples: this.samples.slice() };
  }
}
