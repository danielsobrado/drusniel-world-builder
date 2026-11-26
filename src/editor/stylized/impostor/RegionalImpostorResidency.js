/** Demand comes from completed LOD jobs, not sparse biome guesses. */
export class RegionalImpostorResidency {
  constructor({ load, install, release, remove, concurrency = 2, now = () => performance.now() }) {
    Object.assign(this, { load, install, release, remove, concurrency, now });
    this.demand = new Set();
    this.active = new Map();
    this.loading = new Set();
    this.failed = new Map();
    this.disposed = false;
  }

  setDemand(indices) {
    if (this.disposed) return;
    for (const index of this.demand) if (this.active.has(index)) this.active.set(index, this.now());
    this.demand = new Set(indices);
    for (const index of this.demand) if (this.active.has(index)) this.active.set(index, this.now());
    this.pump();
  }

  pump() {
    if (this.disposed) return;
    for (const index of this.demand) {
      if (this.loading.size >= this.concurrency) break;
      if (this.active.has(index) || this.loading.has(index) || this.failed.has(index)) continue;
      this.loading.add(index);
      Promise.resolve().then(() => this.load(index)).then(atlas => {
        if (this.disposed || !this.demand.has(index)) { this.release(atlas); return; }
        try {
          this.install(index, atlas);
          this.active.set(index, this.now());
        } catch (error) { this.release(atlas); throw error; }
      }).catch(error => {
        if (!this.disposed) {
          this.failed.set(index, error);
          console.warn(`Regional tree impostor ${index} unavailable; retaining proxy.`, error);
        }
      }).finally(() => { this.loading.delete(index); this.pump(); });
    }
  }

  retireIdle(now, idleMs, limit = 1) {
    let retired = 0;
    for (const [index, lastUsed] of this.active) {
      if (this.demand.has(index) || now - lastUsed < idleMs || retired >= limit) continue;
      this.remove(index);
      this.active.delete(index);
      retired++;
    }
    return retired;
  }

  get ready() { return [...this.demand].every(index => this.active.has(index)); }

  dispose() {
    this.disposed = true;
    this.demand.clear();
    for (const index of this.active.keys()) this.remove(index);
    this.active.clear();
  }
}
