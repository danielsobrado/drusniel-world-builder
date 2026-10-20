import { SettlementRegistryPreparation } from './view/SettlementRegistryPreparation.js';
import { SettlementPlanPreparation } from './view/SettlementPlanPreparation.js';

const preparations = new WeakMap();

/** One worker request/index installer per store, shared by every renderer. */
export function settlementPreparationFor(store) {
  if (!preparations.has(store)) preparations.set(store, new SettlementPreparation(store));
  return preparations.get(store);
}

class SettlementPreparation {
  constructor(store) {
    this.store = store;
    this.listeners = new Set();
    const ready = () => { for (const listener of this.listeners) listener(); };
    this.registry = new SettlementRegistryPreparation(ready);
    this.plans = new SettlementPlanPreparation(ready);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  field(generator) {
    const field = this.registry.get(generator, this.store);
    this.plans.configure(field, this.store);
    return field;
  }
}
