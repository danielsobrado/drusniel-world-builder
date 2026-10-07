function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
  return { samples: sorted.length, avgMs: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
    p50Ms: at(0.5), p95Ms: at(0.95), maxMs: sorted.at(-1) ?? null };
}

/** Optional sampled GPU pass queries. Readback never blocks the animation frame. */
export class GpuPassProfiler {
  constructor(renderer, { requested = false, sampleEvery = 8 } = {}) {
    this.renderer = renderer;
    this.backend = renderer?.backend;
    this.requested = requested;
    this.enabled = requested && this.backend?.isWebGPUBackend === true && this.backend.trackTimestamp === true;
    this.sampleEvery = sampleEvery;
    this.frame = 0;
    this.samples = [];
    this.labels = new Map();
    this.pending = null;
    this.error = null;
    if (!this.enabled) return;
    this.backend.trackTimestamp = false;
    this.originalBeginRender = this.backend.beginRender;
    this.wrappedBeginRender = context => {
      const result = this.originalBeginRender.call(this.backend, context);
      if (this.active) {
        const uid = this.backend.getTimestampUID(context);
        const target = context.renderTarget;
        const name = context.color === false ? 'shadow/depth'
          : target?.texture?.name || target?.name || (target ? 'offscreen' : 'screen');
        this.labels.set(uid, `${name} (context ${context.id})`);
      }
      return result;
    };
    this.backend.beginRender = this.wrappedBeginRender;
  }
  reset() { this.samples.length = 0; this.frame = 0; this.generation = (this.generation ?? 0) + 1; }
  beginFrame(timestamp) {
    if (!this.enabled || this.pending || this.error || this.frame++ % this.sampleEvery !== 0) return;
    this.active = true;
    this.timestamp = timestamp;
    this.labels.clear();
    this.backend.trackTimestamp = true;
  }
  endFrame() {
    if (!this.active) return;
    this.active = false;
    this.backend.trackTimestamp = false;
    const labels = new Map(this.labels);
    const timestamp = this.timestamp;
    const generation = this.generation;
    // Resolving requires tracking enabled at call time, before the first await.
    this.backend.trackTimestamp = true;
    const readback = this.renderer.resolveTimestampsAsync('render');
    this.backend.trackTimestamp = false;
    this.pending = readback.then(() => {
      if (generation !== this.generation || !this.enabled) return;
      const passes = {};
      for (const [uid, name] of labels) {
        const value = this.backend.getTimestamp(uid);
        if (Number.isFinite(value) && value >= 0) passes[name] = (passes[name] ?? 0) + value;
      }
      if (Object.keys(passes).length && this.samples.length < 2000) {
        this.samples.push({ timestamp, totalMs: Object.values(passes).reduce((a, b) => a + b, 0), passes });
      }
    }).catch(error => { this.error = error.message; }).finally(() => { this.pending = null; });
  }
  report() {
    if (!this.requested) return null;
    const passes = {};
    for (const sample of this.samples) for (const [name, value] of Object.entries(sample.passes)) {
      (passes[name] ??= []).push(value);
    }
    return { supported: this.enabled, error: this.error,
      source: 'WebGPU timestamp queries', sampleEvery: this.sampleEvery,
      total: stats(this.samples.map(sample => sample.totalMs)),
      passes: Object.fromEntries(Object.entries(passes).map(([name, values]) => [name, stats(values)])),
      frames: this.samples.slice(),
      scope: 'Sampled render passes; excludes CPU submission, uploads and compute work.' };
  }
  dispose() {
    if (!this.enabled) return;
    this.backend.trackTimestamp = false;
    if (this.backend.beginRender === this.wrappedBeginRender) this.backend.beginRender = this.originalBeginRender;
    this.enabled = false;
  }
}
