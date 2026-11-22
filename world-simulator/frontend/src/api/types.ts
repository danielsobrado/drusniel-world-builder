/** Response contracts of the Python backend (world_sim.api). Keep in step with the API. */

export interface WorldRef { mapId: string; sourceFingerprint: string }

export interface Envelope<T, M = undefined> {
  apiVersion: number;
  world: WorldRef;
  data: T;
  meta?: M;
}

export interface PageMeta {
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
  sort: string;
  order: 'asc' | 'desc';
}

export interface SettlementClass { id: string; label: string; maxPopulation: number | null }

export interface Marker {
  id: string; sourceId: number; name: string; class: string; capital: boolean; port: boolean;
  population: number; npcs: number; pilot: boolean; stateId: string | null; cultureId: string | null; x: number; y: number;
}

export interface World {
  mapId: string; name: string; fileName: string; format: string; azgaarVersion: string | null; seed: string | null;
  sourceFingerprint: string; configFingerprint: string;
  mapSize: { width: number; height: number };
  counts: Counts;
  markers: Marker[];
}

export interface Counts { settlements: number; provinces: number; states: number; cultures: number }

export interface RegionSummary {
  id: string; sourceId: number; name: string; color?: string | null; settlementCount: number; settlementPopulation: number;
}

export interface BudgetTotals {
  target: number; allocated: number; difference: number; feasible: boolean; reason: string | null;
  minimumTotal: number; maximumTotal: number; eligibleSettlements: number; ineligibleSettlements: number;
  settlementsAtMinimum: number; settlementsAtMaximum: number; coverage: number;
}

export interface ConnectivitySummary {
  landRoutes: number; seaRoutes: number; routesByGroup: Record<string, number>; roadComponents: number;
  largestComponentSize: number; roadConnectedSettlements: number; isolatedSettlements: number;
  onlyLinkedBySea: number; unresolvedRoutes: number; coordinateMatches: number;
}

export interface Summary {
  world: Omit<World, 'configFingerprint' | 'mapSize' | 'counts' | 'markers'>;
  sourceSettings: { populationRate: number; urbanization: number; distanceUnit: string | null; distanceScale: number; year: number | null; era: string | null };
  counts: Counts;
  referenceCheck: Record<string, { expected: number; observed: number; matches: boolean }> | null;
  population: { named: number; rural: number; total: number };
  populationInterpretation: { canonical: string; gameRenderingAgrees: boolean };
  classes: SettlementClass[];
  classDistribution: { id: string; label: string; minPopulation: number; maxPopulation: number | null; count: number; population: number }[];
  states: RegionSummary[];
  cultures: RegionSummary[];
  provinceCount: number;
  invalidRecords: { sourceId: number; name: string | null; reason: string }[];
  capitals: number;
  ports: number;
  npcBudget: BudgetTotals;
  connectivity: ConnectivitySummary;
  pilotSettlementIds: string[];
}

export interface SettlementRow {
  id: string; sourceId: number; name: string; stateId: string | null; stateName: string; cultureId: string | null;
  cultureName: string | null; population: number; class: string; capital: boolean; port: boolean; npcs: number; pilot: boolean;
}

export interface Good { name: string; tags?: string[] }

export interface Link {
  settlementId: string; name: string; routeId?: number; group?: string; lengthPx?: number;
  distance?: number; sameRoadComponent?: boolean;
}

export interface SettlementDetail extends SettlementRow {
  populationPoints: number; provinceName: string | null; x: number; y: number; cell: number;
  azgaarType: string | null; azgaarGroup: string | null; civicFeatures: string[];
  geography: { biome: string | null; heightIndex: number; coastal: boolean; riverCell: boolean };
  economy: { extractedGoods: Good[]; craftedGoods: Good[]; marketCenter: boolean; marketId: number | null };
  npcAllocation: { min: number; max: number } | null;
  connectivity: {
    roadConnected: boolean; onLandRoute: boolean; roadComponentId: string | null; distanceUnit: string; distanceScale: number;
    roadLinks: Link[]; seaLinks: Link[]; nearby: Link[];
  };
}

export interface Route { routeId: number; group: string; mode: 'land' | 'sea'; points: [number, number][] }
export interface Connectivity { summary: ConnectivitySummary; routes: Route[] }

export interface GroupRow { key: string; npcs: number; settlements: number; population: number }
export interface BudgetScenario extends BudgetTotals { byClass: GroupRow[]; byState: GroupRow[] }
export interface BudgetComparison {
  configuredTarget: number;
  ranges: Record<string, { min: number; max: number }>;
  importance: { capital: number; port: number; marketCenter: number };
  scenarios: BudgetScenario[];
}

export interface PilotRole {
  role: string; roleLabel: string; settlementId: string; sourceId: number; name: string; stateName: string;
  cultureName: string | null; population: number; class: string; npcs: number; roleStatus: string;
  evidence: { kind: string; detail: string }[];
  detail: SettlementDetail;
}

export interface Pilot {
  mode: 'pinned' | 'search';
  roles: PilotRole[];
  pairwiseRoutes: { from: string; to: string; distancePx: number | null; distance: number | null }[];
  distanceUnit: string;
  totalNpcs: number;
  npcBudgetTarget: { min: number; max: number };
  withinNpcTarget: boolean;
  candidateCounts: Record<string, number>;
  selectionOrder: string[];
  warnings: string[];
}
