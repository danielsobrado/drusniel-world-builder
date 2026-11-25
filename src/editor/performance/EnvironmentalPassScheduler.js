import { PerfCounters } from './qa/PerfCounters.js';

const DEFAULTS = Object.freeze({ enabled: true, windIntervalMs: 13.8, windMaxDeferralMs: 14,
  fieldMaxDeferralMs: 100, preparationSliceMs: 1, initialPassMs: 0.25 });

/** Schedule visual field refreshes without slowing their simulation clocks. */
export class EnvironmentalPassScheduler {
  constructor(settings = {}, now = () => performance.now()) {
    this.settings = { ...DEFAULTS, ...settings };
    this.now = now;
    this.passes = new Map();
    this.preparations = new Map();
  }

  run(key, budget, work, { urgent = false, intervalMs = 0, maxDeferralMs = this.settings.fieldMaxDeferralMs } = {}) {
    let state = this.passes.get(key);
    if (!state) this.passes.set(key, state = { last: -Infinity, due: null, estimate: this.settings.initialPassMs });
    const now = this.now();
    if (this.settings.enabled && !urgent && now - state.last < intervalMs) return false;
    state.due ??= now;
    const execute = () => {
      const start = this.now();
      work();
      const ms = Math.max(0, this.now() - start);
      state.last = this.now();
      state.due = null;
      state.estimate = Math.max(ms, state.estimate * 0.75 + ms * 0.25);
      PerfCounters.inc(`environment:${key}:renders`);
      PerfCounters.inc(`environment:${key}:cpuMs`, ms);
    };
    if (!this.settings.enabled || !budget || urgent || now - state.due >= maxDeferralMs) {
      if (budget) budget.run(execute);
      else execute();
      return true;
    }
    const reservation = budget.reserveStrict(state.estimate);
    if (!reservation) {
      PerfCounters.inc(`environment:${key}:deferred`);
      return false;
    }
    reservation.run(execute);
    return true;
  }

  prepare(key, budget, work) {
    const now = this.now();
    const previous = this.preparations.get(key) ?? -Infinity;
    const slice = this.settings.preparationSliceMs;
    const available = this.settings.enabled && budget ? budget.available(slice) : slice;
    const forced = now - previous >= this.settings.fieldMaxDeferralMs;
    const allowance = available > 0 ? Math.min(slice, available) : forced ? slice : 0;
    if (!allowance) {
      work(() => true);
      return;
    }
    const run = () => {
      const deadline = this.now() + allowance;
      work(() => this.now() >= deadline);
      this.preparations.set(key, this.now());
    };
    if (budget) budget.run(run);
    else run();
  }
}
