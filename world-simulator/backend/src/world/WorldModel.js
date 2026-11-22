import path from 'node:path';
import { loadAzgaarWorld } from './AzgaarWorldLoader.js';
import { buildWorldAudit } from './WorldAudit.js';
import { buildSettlementConnectivity } from '../geography/SettlementConnectivity.js';
import { allocateNpcBudget, groupAllocation } from '../npc/NpcBudgetAllocator.js';
import { selectPilot } from '../pilot/PilotSelector.js';

function budgetFor(audit, npcConfig, target) {
  const budget = allocateNpcBudget(audit.settlements, { ...npcConfig, target });
  return {
    ...budget,
    byClass: groupAllocation(budget, audit.settlements, 'class'),
    byState: groupAllocation(budget, audit.settlements, 'stateName'),
  };
}

/** The read-only world every API request and CLI run shares; built once per process. */
export function buildWorldModel(config) {
  const { root, simulator, npc, pilot } = config;
  const source = loadAzgaarWorld({
    manifestPath: path.resolve(root, simulator.world.manifest),
    mapsDirectory: path.resolve(root, simulator.world.mapsDirectory),
    mapId: simulator.world.mapId,
  });
  const audit = buildWorldAudit(source, simulator);
  const connectivity = buildSettlementConnectivity(audit, source.document.pack.routes, simulator.connectivity);
  const budget = budgetFor(audit, npc, npc.target);
  const scenarios = [...new Set(npc.comparisonScenarios)].sort((a, b) => a - b)
    .map((target) => (target === npc.target ? budget : budgetFor(audit, npc, target)));
  const pilotSelection = selectPilot({ audit, connectivity, budget, pilotConfig: pilot });

  const npcsById = new Map(budget.allocations.map((a) => [a.settlementId, a.npcs]));
  const connectivityById = new Map(connectivity.settlements.map((c) => [c.settlementId, c]));
  const settlementsById = new Map(audit.settlements.map((s) => [s.id, s]));
  const pilotIds = new Set(pilotSelection.roles.map((r) => r.settlementId));
  return Object.freeze({
    config,
    audit,
    connectivity,
    budget,
    scenarios,
    pilot: pilotSelection,
    settlementsById,
    connectivityById,
    npcsById,
    pilotIds,
  });
}
