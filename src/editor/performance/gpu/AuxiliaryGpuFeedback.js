import { PerfCounters } from '../qa/PerfCounters.js';

const TARGETS = Object.freeze({
  ShadowMapFarCascade: 'farShadow',
  WaterReflectionCubeFace: 'cube',
  WaterReflectionPlanar: 'planar',
});
const GROUPS = Object.freeze(Object.values(TARGETS));

export function auxiliaryGpuCosts(passes) {
  const costs = {};
  for (const [name, ms] of Object.entries(passes ?? {})) {
    const target = name.replace(/ \(context \d+\)$/, '');
    const group = Object.hasOwn(TARGETS, target) ? TARGETS[target] : null;
    if (group && Number.isFinite(ms) && ms > 0) costs[group] = (costs[group] ?? 0) + ms;
  }
  return costs;
}

/** Sparse render-pass observations; missing passes are neither zero cost nor recovery evidence. */
export class AuxiliaryGpuFeedback {
  constructor(profiler, settings) {
    this.profiler = profiler;
    this.settings = settings;
    this.scope = null;
    this.lastSample = null;
    this.blockedSample = null;
    this.states = new Map();
  }

  reset(scope = null) {
    this.scope = scope;
    this.blockedSample = this.profiler.latestSample;
    this.lastSample = null;
    this.states.clear();
    this.report(null, null);
  }

  report(now, sample) {
    const result = {};
    PerfCounters.set('auxiliaryGpuAdmission.fresh', Number(Boolean(sample)));
    for (const group of GROUPS) {
      const state = this.states.get(group);
      const fresh = state && now !== null && now - state.seen >= 0 && now - state.seen <= this.settings.maxAgeMs;
      if (!fresh) this.states.delete(group);
      result[group] = Boolean(fresh && state.reduced);
      PerfCounters.set(`auxiliaryGpuAdmission.${group}.ms`, fresh ? state.cost : -1);
      PerfCounters.set(`auxiliaryGpuAdmission.${group}.pressured`, Number(result[group]));
    }
    return result;
  }

  read(scope, now) {
    if (scope === null || !this.profiler.enabled || this.profiler.error) {
      this.reset(scope);
      return null;
    }
    if (this.scope !== scope) {
      this.reset(scope);
      return null;
    }
    const sample = this.profiler.latestSample;
    const gameplay = sample?.gameplay;
    const age = sample ? now - sample.timestamp : Infinity;
    if (!sample || sample === this.blockedSample || gameplay?.scope !== scope
        || !Number.isFinite(age) || age < 0 || age > this.settings.maxAgeMs
        || !Number.isFinite(gameplay.totalMs) || gameplay.totalMs <= 0) {
      this.reset(scope);
      return null;
    }
    this.blockedSample = null;
    if (sample === this.lastSample) return this.report(now, sample);
    if (this.lastSample && (sample.timestamp <= this.lastSample.timestamp
      || sample.timestamp - this.lastSample.timestamp > this.settings.maxAgeMs)) this.states.clear();
    this.lastSample = sample;
    const costs = auxiliaryGpuCosts(gameplay.passes);
    const high = gameplay.totalMs > this.settings.targetRenderMs;
    const low = gameplay.totalMs < this.settings.recoveryRenderMs;
    for (const group of GROUPS) {
      const cost = costs[group];
      if (cost === undefined) continue;
      let state = this.states.get(group);
      if (!state || sample.timestamp - state.seen > this.settings.maxAgeMs) {
        state = { reduced: false, slow: 0, fast: 0, changed: -Infinity };
        this.states.set(group, state);
      }
      state.seen = sample.timestamp;
      state.cost = cost;
      state.slow = high && cost > this.settings.auxiliaryPassMs[group] ? state.slow + 1 : 0;
      state.fast = low ? state.fast + 1 : 0;
      if (sample.timestamp - state.changed < this.settings.minimumDwellMs) continue;
      const reduce = !state.reduced && state.slow >= this.settings.pressureSamples;
      const recover = state.reduced && state.fast >= this.settings.recoverySamples;
      if (reduce || recover) {
        state.reduced = reduce;
        state.changed = sample.timestamp;
        state.slow = state.fast = 0;
        PerfCounters.inc(`auxiliaryGpuAdmission.${group}.transitions`);
      }
    }
    return this.report(now, sample);
  }
}
