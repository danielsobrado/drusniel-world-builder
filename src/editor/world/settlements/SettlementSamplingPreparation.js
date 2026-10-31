import { settlementPreparationFor } from './SettlementPreparation.js';

/** Pins canonical plans before a resumable main-thread terrain query starts. */
export class SettlementSamplingPreparation {
  constructor(store) { this.store = store; this.entries = []; }

  prepare(bounds, shouldYield = () => false) {
    const preparation = settlementPreparationFor(this.store);
    const field = preparation.field(this.store.generator);
    if (!field) return preparation.registry.pending === 0 && preparation.registry.errors.length === 0;
    const { minX, maxX, minZ, maxZ } = bounds;
    const key = `${minX}:${maxX}:${minZ}:${maxZ}`;
    if (field !== this.field || key !== this.key || this.epoch !== preparation.plans.epoch) {
      this.preparation?.plans.release(this);
      this.field = field; this.key = key; this.preparation = preparation;
      this.epoch = preparation.plans.epoch;
      this.ready = false;
      const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
      this.entries = field.entriesNear(x, z, Math.hypot(maxX - minX, maxZ - minZ) / 2)
        .map(({ entry }) => entry);
    }
    if (this.ready) return true;
    preparation.plans.begin(this);
    let ready = true;
    for (const entry of this.entries) {
      if (!preparation.plans.get(entry, 0, this) || !entry.index) ready = false;
    }
    preparation.plans.end();
    let units = 0;
    preparation.plans.advance(() => ++units > 2 || shouldYield());
    this.ready = ready;
    return ready;
  }

  dispose() { this.preparation?.plans.release(this); this.entries = []; this.field = null; this.ready = false; }
}
