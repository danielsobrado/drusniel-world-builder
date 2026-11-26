import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

/** Admission is independent of the main scenery quota and the capture stride. */
export class ReflectionAdmission {
  constructor(settings) {
    this.settings = settings;
    this.wait = null;
  }

  reset() { this.wait = null; }

  allow({ now, due, kind, invalid, partial, estimate, contended, gpuBusy }) {
    if (!due) { this.reset(); return false; }
    if (!this.wait || this.wait.kind !== kind || now < this.wait.since) this.wait = { kind, since: now };
    const age = now - this.wait.since;
    PerfCounters.set('reflectionAdmissionWaitMs', age);
    if (gpuBusy) {
      PerfCounters.inc('reflectionAdmissionGpuDeferred');
      return false;
    }
    const limit = kind === 'planar' ? this.settings.planarCaptureCpuBudgetMs : this.settings.cubeCaptureCpuBudgetMs;
    const expensive = Number.isFinite(estimate) && estimate > limit;
    const urgent = invalid || partial;
    const maxWait = urgent ? this.settings.reflectionUrgentDeferralMs : this.settings.reflectionMaxDeferralMs;
    if ((contended || expensive) && age < maxWait) {
      PerfCounters.inc(contended ? 'reflectionAdmissionPressureDeferred' : 'reflectionAdmissionCostDeferred');
      return false;
    }
    if (contended || expensive) PerfCounters.inc('reflectionAdmissionDeadlineTurns');
    PerfCounters.inc(`reflectionAdmissionEligible.${kind}`);
    return true;
  }

  captured() { this.reset(); }
}
