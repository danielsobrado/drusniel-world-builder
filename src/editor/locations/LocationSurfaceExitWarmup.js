const MIB = 1024 * 1024;

export function nearSurfaceExit(location, feet, meters) {
  if (!location || !feet || !Number.isFinite(meters) || meters <= 0) return false;
  const y = feet.footY ?? feet.y;
  if (![feet.x, y, feet.z].every(Number.isFinite)) return false;
  return (location.exits ?? []).some(exit => !location.site?.links?.[exit.id]
    && Math.hypot(feet.x - exit.x, y - exit.y, feet.z - exit.z) <= meters);
}

/** Predictive uploads have independent visit and renderer headroom limits. */
export class LocationSurfaceExitWarmup {
  constructor(settings) {
    this.settings = settings;
    this.reset();
  }

  reset() {
    this.pinned = new Set();
    this.charge = 0;
    this.nextSample = 0;
    this.failed = false;
  }

  approaching(location, feet) {
    return this.settings.surfaceExitWarmupEnabled
      && nearSurfaceExit(location, feet, this.settings.surfaceExitWarmupMeters);
  }

  beginSample(now) {
    if (this.failed || now < this.nextSample) return false;
    this.nextSample = now + this.settings.surfaceExitWarmupSampleMs;
    return true;
  }

  allows(total, charge) {
    return Number.isFinite(total) && total >= 0 && Number.isFinite(charge) && charge > 0
      && total + charge <= this.settings.surfaceAdaptiveLowMiB * MIB
      && this.charge + charge <= this.settings.surfaceExitWarmupMaxBytes;
  }

  record(resource, charge) {
    this.pinned.add(resource);
    this.charge += charge;
  }
}
