function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
  return { samples: sorted.length, avgMs: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
    p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), p999Ms: at(0.999), maxMs: sorted.at(-1) ?? null };
}

/** Optional sampled GPU pass queries. Readback never blocks the animation frame. */
export class GpuPassProfiler {
  constructor(renderer, { requested = false, sampleEvery = 8, retainHistory = true, staggerSamples = false } = {}) {
    this.renderer = renderer;
    this.backend = renderer?.backend;
    this.requested = requested;
    this.enabled = requested && this.backend?.isWebGPUBackend === true && this.backend.trackTimestamp === true;
    this.sampleEvery = sampleEvery;
    this.staggerSamples = staggerSamples;
    this.retainHistory = retainHistory;
    this.latestSample = null;
    this.scope = null;
    this.frame = 0;
    this.samples = [];
    this.labels = new Map();
    this.gameplayLabels = new Map();
    this.gameplayOpen = false;
    this.gameplayScope = null;
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
        const textureName = target?.texture?.name;
        const name = textureName === 'ShadowMapFarCascade' ? textureName : context.color === false ? 'shadow/depth'
          : textureName || target?.name || (target ? 'offscreen' : 'screen');
        const label = `${name} (context ${context.id})`;
        this.labels.set(uid, label);
        if (this.gameplayOpen) this.gameplayLabels.set(uid, label);
      }
      return result;
    };
    this.backend.beginRender = this.wrappedBeginRender;
  }
  reset() { this.samples.length = 0; this.latestSample = null; this.scope = null; this.frame = 0; this.generation = (this.generation ?? 0) + 1; }
  beginFrame(timestamp) {
    if (!this.enabled || this.pending || this.error) return;
    const frame = this.frame++;
    const phase = frame % (this.staggerSamples ? this.sampleEvery * 2 + 1 : this.sampleEvery);
    if (phase !== 0 && !(this.staggerSamples && phase === this.sampleEvery)) return;
    this.active = true;
    this.scope = null;
    this.mixedScope = false;
    this.timestamp = timestamp;
    this.labels.clear();
    this.gameplayLabels.clear();
    this.gameplayOpen = false;
    this.gameplayScope = null;
    this.backend.trackTimestamp = true;
  }
  markScope(scope) {
    if (!this.active || this.mixedScope) return;
    if (this.scope && this.scope !== scope) { this.mixedScope = true; this.scope = null; }
    else this.scope = scope;
  }
  beginGameplay(scope) {
    if (!this.active || scope === null) return;
    this.gameplayLabels.clear();
    this.gameplayScope = scope;
    this.gameplayOpen = true;
  }

  endGameplay(completed = true) {
    this.gameplayOpen = false;
    if (!completed) { this.gameplayScope = null; this.gameplayLabels.clear(); }
  }

  endFrame() {
    if (!this.active) return;
    this.active = false;
    this.backend.trackTimestamp = false;
    const labels = new Map(this.labels);
    const gameplayLabels = new Map(this.gameplayLabels);
    const gameplayScope = this.gameplayOpen ? null : this.gameplayScope;
    this.gameplayOpen = false;
    const timestamp = this.timestamp;
    const generation = this.generation;
    const scope = this.scope;
    // Resolving requires tracking enabled at call time, before the first await.
    this.backend.trackTimestamp = true;
    let readback;
    try { readback = this.renderer.resolveTimestampsAsync('render'); }
    catch (error) { this.error = String(error?.message ?? error); return; }
    finally { this.backend.trackTimestamp = false; }
    this.pending = Promise.resolve(readback).then(() => {
      if (generation !== this.generation || !this.enabled) return;
      const passes = {}, gameplayPasses = {};
      let completeGameplay = Boolean(gameplayScope && gameplayLabels.size);
      for (const [uid, name] of labels) {
        const available = this.backend.hasTimestampQuery?.(uid) !== false;
        const value = available ? this.backend.getTimestamp(uid) : undefined;
        const valid = Number.isFinite(value) && value >= 0;
        if (valid) passes[name] = (passes[name] ?? 0) + value;
        if (gameplayLabels.has(uid)) {
          if (valid) gameplayPasses[name] = (gameplayPasses[name] ?? 0) + value;
          else completeGameplay = false;
        }
      }
      if (Object.keys(passes).length) {
        const sample = { timestamp, scope, totalMs: Object.values(passes).reduce((a, b) => a + b, 0), passes };
        if (completeGameplay) sample.gameplay = { scope: gameplayScope, passes: gameplayPasses,
          totalMs: Object.values(gameplayPasses).reduce((a, b) => a + b, 0) };
        this.latestSample = sample;
        if (this.retainHistory && this.samples.length < 2000) this.samples.push(sample);
        else if (!this.retainHistory) this.samples[0] = sample;
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
    this.active = false;
    this.latestSample = null;
    this.backend.trackTimestamp = false;
    if (this.backend.beginRender === this.wrappedBeginRender) this.backend.beginRender = this.originalBeginRender;
    this.enabled = false;
  }
}
