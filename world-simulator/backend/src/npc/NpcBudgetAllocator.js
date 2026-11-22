/**
 * Deterministic persistent-NPC allocation:
 *   1. every eligible settlement gets its class minimum;
 *   2. the remaining slots are shared by weight = sqrt(population) * importance;
 *   3. shares that would pass a class maximum are capped and the rest re-shared;
 *   4. integer remainders go to the largest fractions, ties by source id.
 * Targets below the summed minimums or above the summed maximums are reported as
 * infeasible; the allocation then stops at the bound, never past a cap.
 */
export function importanceMultiplier(settlement, importance) {
  let multiplier = 1;
  if (settlement.capital) multiplier *= importance.capital ?? 1;
  if (settlement.port) multiplier *= importance.port ?? 1;
  if (settlement.economy?.marketCenter) multiplier *= importance.marketCenter ?? 1;
  return multiplier;
}

function distribute(entries, slots) {
  const share = new Map(entries.map((e) => [e.sourceId, 0]));
  let open = entries.filter((e) => e.max > e.min && e.weight > 0);
  let remaining = slots;
  while (remaining > 0 && open.length > 0) {
    const totalWeight = open.reduce((sum, e) => sum + e.weight, 0);
    const capped = open.filter((e) => e.min + remaining * e.weight / totalWeight >= e.max);
    if (capped.length === 0) {
      for (const e of open) share.set(e.sourceId, remaining * e.weight / totalWeight);
      break;
    }
    for (const e of capped) { share.set(e.sourceId, e.max - e.min); remaining -= e.max - e.min; }
    open = open.filter((e) => !capped.includes(e));
  }
  const counts = new Map(entries.map((e) => [e.sourceId, e.min + Math.floor(share.get(e.sourceId) + 1e-9)]));
  let leftover = slots - entries.reduce((sum, e) => sum + counts.get(e.sourceId) - e.min, 0);
  const byFraction = entries
    .filter((e) => counts.get(e.sourceId) < e.max)
    .map((e) => ({ e, fraction: share.get(e.sourceId) - Math.floor(share.get(e.sourceId) + 1e-9) }))
    .sort((a, b) => b.fraction - a.fraction || a.e.sourceId - b.e.sourceId);
  for (const { e } of byFraction) {
    if (leftover <= 0) break;
    counts.set(e.sourceId, counts.get(e.sourceId) + 1);
    leftover -= 1;
  }
  return counts;
}

export function allocateNpcBudget(settlements, { target, ranges, importance = {}, minimumEligiblePopulation = 1 }) {
  const eligible = settlements.filter((s) => s.population >= minimumEligiblePopulation);
  const entries = eligible
    .map((s) => {
      const range = ranges[s.class];
      if (!range) throw new Error(`No NPC range configured for settlement class ${s.class}`);
      return { sourceId: s.sourceId, id: s.id, min: range.min, max: range.max, weight: Math.sqrt(s.population) * importanceMultiplier(s, importance) };
    })
    .sort((a, b) => a.sourceId - b.sourceId);
  const minimumTotal = entries.reduce((sum, e) => sum + e.min, 0);
  const maximumTotal = entries.reduce((sum, e) => sum + e.max, 0);

  let feasibility = { feasible: true, reason: null };
  let counts;
  if (target < minimumTotal) {
    feasibility = { feasible: false, reason: `Target ${target} is below the ${minimumTotal} NPCs that class minimums require across ${entries.length} settlements; allocation holds every settlement at its minimum.` };
    counts = new Map(entries.map((e) => [e.sourceId, e.min]));
  } else if (target > maximumTotal) {
    feasibility = { feasible: false, reason: `Target ${target} exceeds the ${maximumTotal} NPCs that class maximums allow; allocation stops at every cap, ${target - maximumTotal} slots unassigned.` };
    counts = new Map(entries.map((e) => [e.sourceId, e.max]));
  } else {
    counts = distribute(entries, target - minimumTotal);
  }

  const allocations = entries.map((e) => ({ settlementId: e.id, sourceId: e.sourceId, npcs: counts.get(e.sourceId), min: e.min, max: e.max, weight: Number(e.weight.toFixed(4)) }));
  const allocated = allocations.reduce((sum, a) => sum + a.npcs, 0);
  for (const a of allocations) {
    if (a.npcs < a.min || a.npcs > a.max) throw new Error(`NPC allocation broke the range of settlement ${a.sourceId}`);
  }
  if (feasibility.feasible && allocated !== target) throw new Error(`NPC allocation summed to ${allocated}, expected ${target}`);
  return {
    target,
    allocated,
    difference: allocated - target,
    ...feasibility,
    minimumTotal,
    maximumTotal,
    eligibleSettlements: entries.length,
    ineligibleSettlements: settlements.length - entries.length,
    settlementsAtMaximum: allocations.filter((a) => a.npcs === a.max).length,
    settlementsAtMinimum: allocations.filter((a) => a.npcs === a.min).length,
    allocations,
  };
}

/** Allocation totals grouped by a settlement field (class, stateName...). */
export function groupAllocation(budget, settlements, field) {
  const byId = new Map(settlements.map((s) => [s.id, s]));
  const groups = new Map();
  for (const a of budget.allocations) {
    const key = byId.get(a.settlementId)[field] ?? 'none';
    const group = groups.get(key) ?? { key, settlements: 0, npcs: 0, population: 0 };
    group.settlements += 1;
    group.npcs += a.npcs;
    group.population += byId.get(a.settlementId).population;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}
