import { PerfCounters } from '../qa/PerfCounters.js';

const GROUPS = Object.freeze(['ao', 'ssr', 'bloom', 'shafts', 'volumetric']);
const bindings = new WeakMap();

/** Classify only known targets whose workload the existing quality knobs change. */
export function classifyGpuPass(name) {
  const target = name.replace(/ \(context \d+\)$/, '');
  if (target === 'GTAONode.AO') return 'ao';
  if (target === 'Adaptive SSR Trace') return 'ssr';
  if (target === 'Adaptive Bloom Prefilter' || /^Adaptive Bloom Downsample \d+$/.test(target)) return 'bloom';
  if (['Adaptive Shaft Radiance', 'God Rays Half Resolution', 'Gods End quarter-resolution shafts'].includes(target)) return 'shafts';
  if (target === 'Godrays') return 'volumetric';
  return null;
}

export function groupGpuPasses(passes) {
  const result = {};
  for (const [name, ms] of Object.entries(passes ?? {})) {
    const group = classifyGpuPass(name);
    if (group && Number.isFinite(ms) && ms > 0) result[group] = (result[group] ?? 0) + ms;
  }
  return result;
}

/** One renderer, one timestamp owner, one bounded feedback state per active render path. */
export class GpuPassFeedback {
  constructor(profiler, settings) {
    this.profiler = profiler;
    this.settings = settings;
    this.scope = null;
    this.lastSample = null;
    this.states = new Map();
    this.selection = [];
  }

  reset(scope) {
    this.scope = scope;
    this.lastSample = null;
    this.states.clear();
    this.selection = [];
  }

  read(scope, now, bypass = false) {
    if (this.scope !== scope) this.reset(scope);
    if (this.profiler.active) this.profiler.scope = scope;
    const sample = this.profiler.latestSample;
    const age = sample ? now - sample.timestamp : Infinity;
    const valid = !bypass && this.profiler.enabled && !this.profiler.error && sample?.scope === scope
      && Number.isFinite(age) && age >= 0 && age <= this.settings.maxAgeMs && Number.isFinite(sample.totalMs) && sample.totalMs > 0;
    PerfCounters.set('gpuAdmission.fresh', Number(valid));
    if (!valid) {
      this.reset(scope);
      return null;
    }
    PerfCounters.set('gpuAdmission.sampleAgeMs', age);
    PerfCounters.set('gpuAdmission.renderMs', sample.totalMs);
    if (sample === this.lastSample) return { groups: this.selection };
    // A long interval or a clock reset breaks evidence continuity.
    if (this.lastSample && (sample.timestamp <= this.lastSample.timestamp || sample.timestamp - this.lastSample.timestamp > this.settings.maxAgeMs)) this.reset(scope);
    this.lastSample = sample;
    const costs = groupGpuPasses(sample.passes);
    const high = sample.totalMs > this.settings.targetRenderMs;
    const low = sample.totalMs < this.settings.recoveryRenderMs;
    const candidates = [];
    for (const group of GROUPS) {
      const cost = costs[group];
      const state = this.states.get(group) ?? { reduced: false, slow: 0, fast: 0, changed: -Infinity };
      this.states.set(group, state);
      PerfCounters.set(`gpuAdmission.${group}.ms`, cost ?? -1);
      // Absent timestamps are unknown, never a free pass or recovery evidence.
      state.slow = high && cost !== undefined && cost > this.settings.passMs[group] ? state.slow + 1 : 0;
      state.fast = low && cost !== undefined ? state.fast + 1 : 0;
      if (sample.timestamp - state.changed < this.settings.minimumDwellMs) continue;
      if (!state.reduced && state.slow >= this.settings.pressureSamples) candidates.push({ group, state, reduced: true, priority: cost / this.settings.passMs[group] });
      else if (state.reduced && state.fast >= this.settings.recoverySamples) candidates.push({ group, state, reduced: false, priority: 0 });
    }
    candidates.sort((a, b) => b.priority - a.priority);
    const next = candidates[0];
    if (next) {
      next.state.reduced = next.reduced;
      next.state.changed = sample.timestamp;
      next.state.slow = next.state.fast = 0;
      PerfCounters.inc('gpuAdmission.transitions');
    }
    this.selection = GROUPS.filter(group => this.states.get(group)?.reduced);
    for (const group of GROUPS) PerfCounters.set(`gpuAdmission.${group}.reduced`, Number(this.selection.includes(group)));
    return { groups: this.selection };
  }

  dispose() { this.reset(null); }
}

export function bindGpuFeedback(renderer, feedback) {
  bindings.set(renderer, feedback);
  return () => { if (bindings.get(renderer) === feedback) bindings.delete(renderer); };
}

export function readGpuFeedback(renderer, scope, now, bypass = false) {
  return bindings.get(renderer)?.read(scope, now, bypass) ?? null;
}

export function hasGpuFeedback(renderer) { return bindings.has(renderer); }
