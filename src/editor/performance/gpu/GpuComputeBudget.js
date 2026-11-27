import { PerfCounters } from '../qa/PerfCounters.js';

const bindings = new WeakMap();

/** Weighted workload credits, not measured GPU time. Mandatory dependencies never wait. */
export class GpuComputeBudget {
  constructor(settings) {
    this.settings = settings;
    this.waits = new WeakMap();
    this.now = null;
    this.active = false;
  }

  beginFrame(now) {
    if (!Number.isFinite(now)) { this.suspend(); return; }
    if (this.now !== null && (now < this.now || now - this.now > this.settings.maxFrameGapMs)) this.waits = new WeakMap();
    this.now = now;
    this.active = true;
    this.used = 0;
    this.mandatory = 0;
    this.optional = 0;
    this.deferred = 0;
    this.forced = 0;
  }

  admit(owner, kind, units = 1, mandatory = false) {
    if (!this.active) return true;
    const weight = this.settings.credits[kind];
    if (!Number.isFinite(weight) || !Number.isFinite(units) || units <= 0) return true;
    const cost = weight * units;
    const maximum = this.settings.frameCredits;
    const reserve = Math.max(0, this.settings.mandatoryReserveCredits - this.mandatory);
    const fits = this.used + cost + reserve <= maximum;
    if (!mandatory && !fits) {
      const since = this.waits.get(owner) ?? this.now;
      this.waits.set(owner, since);
      if (this.now - since < this.settings.maxDeferralMs[kind]) {
        this.deferred++;
        PerfCounters.inc(`gpuCompute.${kind}.deferred`);
        return false;
      }
      this.forced++;
      PerfCounters.inc(`gpuCompute.${kind}.deadline`);
    }
    this.waits.delete(owner);
    this.used += cost;
    if (mandatory) this.mandatory += cost;
    else this.optional += cost;
    PerfCounters.inc(`gpuCompute.${kind}.credits`, cost);
    PerfCounters.inc(`gpuCompute.${kind}.admitted`);
    return true;
  }

  cancel(owner) { this.waits.delete(owner); }

  endFrame() {
    if (!this.active) return;
    this.active = false;
    PerfCounters.set('gpuCompute.frameCredits', this.used);
    PerfCounters.set('gpuCompute.mandatoryCredits', this.mandatory);
    PerfCounters.set('gpuCompute.optionalCredits', this.optional);
    PerfCounters.set('gpuCompute.deferred', this.deferred);
    PerfCounters.set('gpuCompute.deadlineTurns', this.forced);
    PerfCounters.set('gpuCompute.overflowCredits', Math.max(0, this.used - this.settings.frameCredits));
  }

  suspend() {
    this.endFrame();
    this.now = null;
    this.waits = new WeakMap();
  }
}

export function bindComputeBudget(renderer, budget) {
  bindings.set(renderer, budget);
  return () => {
    if (bindings.get(renderer) === budget) bindings.delete(renderer);
    budget.suspend();
  };
}

export function admitCompute(renderer, owner, kind, units = 1, mandatory = false) {
  return bindings.get(renderer)?.admit(owner, kind, units, mandatory) ?? true;
}

export function cancelComputeWait(renderer, owner) {
  bindings.get(renderer)?.cancel(owner);
}
