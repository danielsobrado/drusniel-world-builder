/** Disposable plans stay bounded independently in the main field and each worker.
 * Registry entries remain stable because spatial buckets also reference them. */
export class SettlementPlanCache {
  constructor({ maxEntries = 32, maxBytes = 32 * 1024 * 1024 } = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.entries = new Map();
    this.pins = new Map();
    this.estimatedBytes = 0;
    this.evictions = 0;
  }

  retain(entry) {
    if (!entry.plan) return;
    const previous = this.entries.get(entry);
    if (previous?.plan === entry.plan && previous.skyline === entry.skyline) {
      if (this.last !== entry) { this.entries.delete(entry); this.entries.set(entry, previous); this.last = entry; }
      return;
    }
    const skylineBytes = ['positions', 'normals', 'colors', 'indices']
      .reduce((sum, key) => sum + (entry.skyline?.[key]?.byteLength ?? 0), 0);
    // JS object sizes are engine-dependent; these weights are budgeting estimates.
    const estimatedBytes = skylineBytes + entry.plan.buildings.length * 768
      + (entry.plan.props?.length ?? 0) * 256 + (entry.index?.grid.buckets.size ?? 0) * 128
      + entry.plan.streets.reduce((sum, street) => sum + street.points.length * 64, 0);
    this.estimatedBytes += estimatedBytes - (previous?.estimatedBytes ?? 0);
    this.entries.delete(entry);
    this.entries.set(entry, { plan: entry.plan, skyline: entry.skyline, skylineBytes, estimatedBytes });
    this.last = entry;
    this.trim(entry);
  }

  pin(owner, ids) { this.pins.set(owner, ids); this.trim(); }
  release(owner) { this.pins.delete(owner); this.trim(); }
  isPinned(entry) {
    for (const ids of this.pins.values()) if (ids.has(entry.settlement.id)) return true;
    return false;
  }
  trim(current = null) {
    for (const [entry, accounting] of this.entries) {
      if (this.entries.size <= this.maxEntries && this.estimatedBytes <= this.maxBytes) break;
      if (entry === current || this.isPinned(entry)) continue;
      entry.plan = undefined; entry.index = null; entry.skyline = undefined;
      this.entries.delete(entry);
      this.estimatedBytes -= accounting.estimatedBytes;
      if (this.last === entry) this.last = null;
      this.evictions++;
    }
  }

  getStatus() {
    let pinned = 0, skylineBytes = 0;
    for (const [entry, accounting] of this.entries) {
      pinned += Number(this.isPinned(entry)); skylineBytes += accounting.skylineBytes;
    }
    return { plans: this.entries.size, pinned, skylineBytes, estimatedBytes: this.estimatedBytes,
      maxEntries: this.maxEntries, maxBytes: this.maxBytes, evictions: this.evictions,
      overBudget: this.entries.size > this.maxEntries || this.estimatedBytes > this.maxBytes };
  }
}
