import { shortestDistances } from '../geography/SettlementConnectivity.js';

/**
 * Evidence for one role. Roles are hypotheses: Azgaar records what a burg
 * extracts and crafts, not what its economy is "for".
 */
export function roleEvidence(settlement, role) {
  const evidence = [];
  if (role.marketCenter && settlement.economy.marketCenter) evidence.push({ kind: 'market-center', detail: `Azgaar market ${settlement.economy.marketId} is centred here`, weight: 3 });
  if (role.marketCenter && evidence.length > 0) {
    if (settlement.port) evidence.push({ kind: 'port', detail: 'Port burg', weight: 1 });
    if (settlement.capital) evidence.push({ kind: 'capital', detail: 'State capital', weight: 1 });
  }
  const tags = new Set(role.extractedGoodTags ?? []);
  for (const good of settlement.economy.extractedGoods) {
    if (good.tags.some((t) => tags.has(t))) evidence.push({ kind: 'extracts', detail: `Extracts ${good.name}`, weight: 3 });
  }
  const crafted = new Set(role.craftedGoods ?? []);
  for (const good of settlement.economy.craftedGoods) {
    if (crafted.has(good.name)) evidence.push({ kind: 'crafts', detail: `Crafts ${good.name}`, weight: 1 });
  }
  return evidence;
}

const evidenceScore = (evidence) => evidence.reduce((sum, e) => sum + e.weight, 0);

function candidatesFor(role, settlements) {
  return settlements
    .map((settlement) => ({ settlement, evidence: roleEvidence(settlement, role) }))
    .filter((c) => c.evidence.length > 0)
    .map((c) => ({ ...c, score: evidenceScore(c.evidence) }));
}

function compareTriples(a, b) {
  return (b.withinTarget - a.withinTarget)
    || (b.distinctClasses - a.distinctClasses)
    || (b.minScore - a.minScore)
    || (a.totalDistance - b.totalDistance)
    || a.ids.localeCompare(b.ids);
}

/** Deterministic pick of one connected settlement per role, or validation of pinned ids. */
export function selectPilot({ audit, connectivity, budget, pilotConfig }) {
  const { roles, constraints } = pilotConfig;
  const npcsById = new Map(budget.allocations.map((a) => [a.settlementId, a.npcs]));
  const graph = connectivity.landGraph;
  const cache = new Map();
  const distance = (a, b) => {
    if (!graph.has(a.cell) || !graph.has(b.cell)) return Infinity;
    if (!cache.has(a.cell)) cache.set(a.cell, shortestDistances(graph, a.cell));
    return cache.get(a.cell).get(b.cell) ?? Infinity;
  };
  const range = constraints.npcBudgetTarget;
  const evaluate = (picks) => {
    const [r, f, t] = picks;
    const pairs = [[t, r], [t, f], [r, f]].map(([a, b]) => ({ a, b, distancePx: distance(a.settlement, b.settlement) }));
    const npcs = picks.reduce((sum, p) => sum + (npcsById.get(p.settlement.id) ?? 0), 0);
    return {
      picks,
      pairs,
      npcs,
      connected: pairs.every((p) => Number.isFinite(p.distancePx)),
      withinDistance: pairs.every((p) => p.distancePx <= constraints.maxRouteDistance),
      withinTarget: Number(npcs >= range.min && npcs <= range.max),
      distinctClasses: new Set(picks.map((p) => p.settlement.class)).size,
      minScore: Math.min(...picks.map((p) => p.score)),
      totalDistance: pairs.reduce((sum, p) => sum + p.distancePx, 0),
      ids: picks.map((p) => String(p.settlement.sourceId).padStart(6, '0')).join('-'),
    };
  };

  const candidates = roles.map((role) => candidatesFor(role, audit.settlements));
  let best;
  let mode;
  if (pilotConfig.pinnedSourceIds?.length) {
    mode = 'pinned';
    if (pilotConfig.pinnedSourceIds.length !== roles.length) throw new Error('pinnedSourceIds must list one settlement per role');
    const picks = pilotConfig.pinnedSourceIds.map((sourceId, index) => {
      const settlement = audit.settlements.find((s) => s.sourceId === sourceId);
      if (!settlement) throw new Error(`Pinned pilot settlement ${sourceId} is not a valid settlement`);
      const evidence = roleEvidence(settlement, roles[index]);
      return { settlement, evidence, score: evidenceScore(evidence) };
    });
    best = evaluate(picks);
  } else {
    mode = 'search';
    const [resource, food, trade] = candidates;
    for (const t of trade) {
      for (const r of resource) {
        if (r.settlement === t.settlement || distance(t.settlement, r.settlement) > constraints.maxRouteDistance) continue;
        for (const f of food) {
          if (f.settlement === t.settlement || f.settlement === r.settlement) continue;
          const triple = evaluate([r, f, t]);
          if (constraints.requireRoadConnection && !(triple.connected && triple.withinDistance)) continue;
          if (!best || compareTriples(triple, best) < 0) best = triple;
        }
      }
    }
    if (!best) throw new Error('No road-connected settlement triple satisfies the pilot roles and maxRouteDistance');
  }

  const scale = connectivity.distanceScale;
  const warnings = [];
  if (!best.connected) warnings.push('Pilot settlements are not all joined by imported roads or trails.');
  if (!best.withinTarget) warnings.push(`Pilot holds ${best.npcs} NPCs under the configured target, outside the ${range.min}-${range.max} aim.`);
  best.picks.forEach((p, i) => { if (p.evidence.length === 0) warnings.push(`${p.settlement.name} shows no source evidence for the ${roles[i].id} role.`); });

  return {
    mode,
    roles: roles.map((role, i) => {
      const { settlement, evidence } = best.picks[i];
      return {
        role: role.id,
        roleLabel: role.label,
        settlementId: settlement.id,
        sourceId: settlement.sourceId,
        name: settlement.name,
        stateName: settlement.stateName,
        cultureName: settlement.cultureName,
        population: settlement.population,
        class: settlement.class,
        npcs: npcsById.get(settlement.id) ?? 0,
        roleStatus: 'hypothesis',
        evidence: evidence.map(({ kind, detail }) => ({ kind, detail })),
      };
    }),
    pairwiseRoutes: best.pairs.map((p) => ({
      from: p.a.settlement.id,
      to: p.b.settlement.id,
      distancePx: Number.isFinite(p.distancePx) ? Number(p.distancePx.toFixed(2)) : null,
      distance: Number.isFinite(p.distancePx) ? Number((p.distancePx * scale).toFixed(1)) : null,
    })),
    distanceUnit: connectivity.distanceUnit,
    totalNpcs: best.npcs,
    npcBudgetTarget: range,
    withinNpcTarget: Boolean(best.withinTarget),
    candidateCounts: Object.fromEntries(roles.map((role, i) => [role.id, candidates[i].length])),
    selectionOrder: ['NPC total inside target range', 'distinct settlement classes', 'weakest role evidence', 'shortest summed road distance', 'source ids'],
    warnings,
  };
}
