import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

export function reducedSampleCount(authored, factor, minimum) {
  return Math.min(authored, Math.max(minimum, Math.ceil(authored * factor)));
}

export function reducedResolution(authored, factor, minimum) {
  return Math.min(authored, Math.max(minimum, authored * factor));
}

/** Frame cadence is a pressure proxy, not a GPU timer. Gaps never trigger demotion. */
export class AtmosphericPassAdmission {
  constructor(settings, name) {
    this.settings = settings;
    this.name = name;
    this.reset();
  }

  reset() {
    this.last = null;
    this.changedAt = -Infinity;
    this.slowMs = 0;
    this.fastMs = 0;
    this.reduced = false;
  }

  update(now, bypass = false) {
    const delta = this.last === null ? 0 : now - this.last;
    this.last = now;
    if (bypass || !Number.isFinite(delta) || delta <= 0 || delta > this.settings.maxFrameGapMs) {
      this.slowMs = 0;
      this.fastMs = 0;
      if (bypass) this.setReduced(false, now);
    } else {
      this.slowMs = delta > this.settings.targetFrameMs ? this.slowMs + delta : 0;
      this.fastMs = delta < this.settings.recoveryFrameMs ? this.fastMs + delta : 0;
      if (now - this.changedAt >= this.settings.minimumDwellMs) {
        if (!this.reduced && this.slowMs >= this.settings.pressureMs) this.setReduced(true, now);
        else if (this.reduced && this.fastMs >= this.settings.recoveryMs) this.setReduced(false, now);
      }
    }
    PerfCounters.set(`atmosphericAdmission.${this.name}.reduced`, Number(this.reduced));
    return this.reduced ? this.settings : null;
  }

  setReduced(value, now) {
    if (this.reduced === value) return;
    this.reduced = value;
    this.changedAt = now;
    this.slowMs = 0;
    this.fastMs = 0;
    PerfCounters.inc(`atmosphericAdmission.${this.name}.transitions`);
  }
}
