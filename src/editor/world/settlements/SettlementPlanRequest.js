import { serializeSettlementRegistry } from './SettlementRegistry.js';
import { prepareSettlementSkyline } from './view/SettlementSkylineData.js';

/** Runs on the limited settlement worker, with canonical ground and routes. */
export function generateSettlementPlan(generator, id) {
  const field = generator.ensureSettlementField?.();
  const entry = field?.findById(id);
  if (!entry) throw new Error(`Settlement ${id} is absent from this world.`);
  const plan = field.ensurePlan(entry).plan;
  return { settlementId: id, plan, skyline: prepareSettlementSkyline(plan) };
}

export function generateSettlementRegistry(generator) {
  const field = generator.ensureSettlementField?.();
  return { registry: field ? serializeSettlementRegistry(field, generator.settlementRegistryKey) : null };
}
