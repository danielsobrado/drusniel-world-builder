const MIB = 1024 * 1024;

function validBytes(value) {
  return Number.isFinite(value) && value >= 0;
}

/** Pressure decisions use renderer accounting, never inferred physical VRAM. */
export class LocationSurfaceMemoryPolicy {
  constructor(settings) {
    this.settings = settings;
    this.reset();
  }

  reset() {
    this.pressure = false;
    this.accountedTotal = null;
    this.evictedCharge = 0;
  }

  sample(renderer) {
    const total = renderer.info?.memory?.total;
    this.accountedTotal = validBytes(total) ? total : null;
    if (!this.settings.surfaceAdaptiveReclamationEnabled || this.accountedTotal === null) {
      this.pressure = false;
      return 'legacy';
    }
    const high = this.settings.surfaceAdaptiveHighMiB * MIB;
    const low = this.settings.surfaceAdaptiveLowMiB * MIB;
    if (total >= high) this.pressure = true;
    else if (total <= low) this.pressure = false;
    return this.pressure ? 'pressure' : 'idle';
  }

  charge(entry, renderer) {
    // Deferred owners already account for their attachments or topology.
    const accounted = entry.deferred ? undefined : renderer.info?.memoryMap?.get?.(entry.resource);
    return validBytes(accounted) && accounted > 0 ? accounted : entry.size;
  }

  rank(entries, renderer) {
    const distanceScale = Math.max(1, this.settings.surfaceProtectMeters);
    return entries.map(entry => {
      const charge = this.charge(entry, renderer);
      const distanceWeight = Number.isFinite(entry.distance)
        ? 1 + Math.min(4, Math.max(0, entry.distance) / distanceScale) : 1;
      const cost = entry.deferred ? this.settings.surfaceAdaptiveDeferredCost
        : entry.kind === 'impostor' ? this.settings.surfaceAdaptiveImpostorCost : 1;
      return { entry, charge, score: charge * distanceWeight / cost };
    }).sort((a, b) => b.score - a.score || b.charge - a.charge
      || (a.entry.distance === b.entry.distance ? 0 : b.entry.distance - a.entry.distance));
  }

  allows(charge) {
    return this.evictedCharge + charge <= this.settings.surfaceAdaptiveMaxMiB * MIB;
  }

  record(charge) {
    this.evictedCharge += charge;
  }
}
