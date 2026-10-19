/** Runs on the existing terrain worker, with its canonical ground and routes. */
export function generateSettlementPlan(generator, id) {
  const field = generator.ensureSettlementField?.();
  const entry = field?.entries.find(candidate => candidate.settlement.id === id);
  if (!entry) throw new Error(`Settlement ${id} is absent from this world.`);
  return { settlementId: id, plan: field.ensurePlan(entry).plan };
}
