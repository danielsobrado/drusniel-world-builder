/** One stride clock; separate CPU estimates for a cube face and a planar draw. */
export class ReflectionCaptureSchedule {
  constructor(config) {
    this.stride = config.captureFrameStride ?? 4;
    this.safetyFactor = config.captureSafetyFactor ?? 1.25;
    this.initialCpuMs = config.initialCaptureCpuMs ?? 2;
    this.frame = 0;
    this.maxDeferralMs = config.maxCaptureDeferralMs ?? 100;
    this.deferredSince = null;
    this.estimates = { cube: null, planar: null };
  }

  nextFrame() { return this.frame++ % this.stride === 0; }

  budgetMs(kind) { return Math.max(0.25, this.estimates[kind] ?? this.initialCpuMs) * this.safetyFactor; }

  reserve({ now, estimate, contended, reserve, reserveStrict }) {
    if (!reserveStrict) {
      this.deferredSince = null;
      return reserve(estimate);
    }
    const strict = reserveStrict(estimate);
    if (strict) {
      this.deferredSince = null;
      return strict;
    }
    if (!contended) {
      this.deferredSince = null;
      return reserve(estimate);
    }
    this.deferredSince ??= now;
    if (now - this.deferredSince < this.maxDeferralMs) return null;
    const fallback = reserve(estimate);
    if (fallback) this.deferredSince = null;
    return fallback;
  }

  record(kind, cpuMs) {
    if (!Number.isFinite(cpuMs) || cpuMs < 0) return;
    const previous = this.estimates[kind];
    // React to an expensive capture immediately; relax gradually as it gets cheaper.
    this.estimates[kind] = previous === null ? cpuMs : Math.max(cpuMs, previous * 0.75 + cpuMs * 0.25);
  }
}
