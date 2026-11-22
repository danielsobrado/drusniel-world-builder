import { readFileSync } from 'node:fs';
import { checksumCanonical } from '../../../../src/sim/persistence/canonicalSerialize.js';

export const REPORT_SCHEMA_VERSION = 1;
const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

export function worldIdentity(model) {
  const { identity } = model.audit;
  return {
    mapId: identity.mapId,
    name: identity.name,
    fileName: identity.fileName,
    format: identity.format,
    azgaarVersion: identity.azgaarVersion,
    seed: identity.seed,
    sourceFingerprint: identity.sourceFingerprint,
  };
}

export function configFingerprint(config) {
  return checksumCanonical({
    classification: config.simulator.classification,
    connectivity: config.simulator.connectivity,
    npc: config.npc,
    pilot: config.pilot,
  });
}

function meta(model, artifact) {
  return {
    artifact,
    schemaVersion: REPORT_SCHEMA_VERSION,
    generator: { name: pkg.name, version: pkg.version },
    world: worldIdentity(model),
    configFingerprint: configFingerprint(model.config),
  };
}

const budgetTotals = (b) => ({
  target: b.target, allocated: b.allocated, difference: b.difference, feasible: b.feasible, reason: b.reason,
  minimumTotal: b.minimumTotal, maximumTotal: b.maximumTotal, eligibleSettlements: b.eligibleSettlements,
  ineligibleSettlements: b.ineligibleSettlements, settlementsAtMinimum: b.settlementsAtMinimum, settlementsAtMaximum: b.settlementsAtMaximum,
  coverage: b.eligibleSettlements / (b.eligibleSettlements + b.ineligibleSettlements),
});

export function buildSummary(model) {
  const { audit, connectivity, budget, pilot } = model;
  return {
    world: worldIdentity(model),
    sourceSettings: audit.sourceSettings,
    mapSize: audit.mapSize,
    counts: audit.counts,
    referenceCheck: audit.referenceCheck,
    population: audit.population,
    populationInterpretation: audit.populationInterpretation,
    classes: model.config.simulator.classification.map(({ id, label, maxPopulation }) => ({ id, label, maxPopulation: maxPopulation ?? null })),
    classDistribution: audit.classDistribution,
    states: audit.states,
    cultures: audit.cultures,
    provinceCount: audit.provinces.length,
    invalidRecords: audit.invalidRecords,
    removedCount: audit.removedCount,
    capitals: audit.settlements.filter((s) => s.capital).length,
    ports: audit.settlements.filter((s) => s.port).length,
    npcBudget: budgetTotals(budget),
    connectivity: connectivity.summary,
    pilotSettlementIds: pilot.roles.map((r) => r.settlementId),
  };
}

/** A settlement row with its computed NPC count and pilot flag. */
export function settlementRow(model, settlement) {
  return { ...settlement, npcs: model.npcsById.get(settlement.id) ?? 0, pilot: model.pilotIds.has(settlement.id) };
}

export function settlementDetail(model, settlement) {
  const connectivity = model.connectivityById.get(settlement.id);
  const name = (id) => model.settlementsById.get(id)?.name ?? null;
  const allocation = model.budget.allocations.find((a) => a.settlementId === settlement.id) ?? null;
  return {
    ...settlementRow(model, settlement),
    npcAllocation: allocation,
    connectivity: {
      ...connectivity,
      distanceUnit: model.connectivity.distanceUnit,
      distanceScale: model.connectivity.distanceScale,
      roadLinks: connectivity.roadLinks.map((l) => ({ ...l, name: name(l.settlementId) })),
      seaLinks: connectivity.seaLinks.map((l) => ({ ...l, name: name(l.settlementId) })),
      nearby: connectivity.nearby.map((n) => ({ ...n, name: name(n.settlementId) })),
    },
  };
}

export function buildConnectivityReport(model) {
  const { connectivity } = model;
  return {
    distanceUnit: connectivity.distanceUnit,
    distanceScale: connectivity.distanceScale,
    summary: connectivity.summary,
    components: connectivity.components,
    unresolvedRoutes: connectivity.unresolvedRoutes,
    routes: connectivity.routes,
    settlements: connectivity.settlements,
  };
}

export function buildBudgetComparison(model) {
  return {
    configuredTarget: model.config.npc.target,
    ranges: model.config.npc.ranges,
    importance: model.config.npc.importance,
    minimumEligiblePopulation: model.config.npc.minimumEligiblePopulation,
    scenarios: model.scenarios.map((b) => ({ ...budgetTotals(b), byClass: b.byClass, byState: b.byState })),
  };
}

export function buildReports(model) {
  return {
    'world-summary.json': { meta: meta(model, 'world-summary'), data: buildSummary(model) },
    'settlements.json': { meta: meta(model, 'settlements'), data: model.audit.settlements.map((s) => settlementRow(model, s)) },
    'connectivity.json': { meta: meta(model, 'connectivity'), data: buildConnectivityReport(model) },
    'npc-budget-comparison.json': { meta: meta(model, 'npc-budget-comparison'), data: buildBudgetComparison(model) },
    'pilot-settlements.json': { meta: meta(model, 'pilot-settlements'), data: model.pilot },
  };
}
