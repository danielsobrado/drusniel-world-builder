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

/* ---- Simulation (scenarios) ---- */

export interface CalendarDate { day: number; year: number; month: number; dayOfMonth: number; label: string }
export interface ScenarioScope { type: 'pilot' | 'state' | 'province' | 'settlements'; id?: string | null; settlementIds?: string[] | null }

export interface ScenarioStatus {
  id: string; name: string; description: string; scope: ScenarioScope; seed: number;
  parent: { scenarioId: string; snapshotId: string } | null; createdAt: string; snapshotSeq: number; eventSeq: number;
  settlementIds: string[]; date: CalendarDate; running: boolean; speed: number; population: number;
  checksum: string; snapshots: number; error: string | null; readOnly: string | null; schemaVersion: number;
  rulesFingerprint?: string | null; rulesCurrent?: boolean;
}

export interface Cohorts { children: number; adults: number; elders: number }
export interface HouseholdGroup { kind: string; label: string; households: number; adults: number; children: number; elders: number }
export interface HousingStock { type: string; label: string; buildings: number; capacity: number; occupied: number; vacant: number }
export interface Business {
  id: string; settlementId: string; kind: string; name: string; sector: string; profession: string; good: string | null;
  staff: number; wage: number; filled: number; evidence: string | null; settlementName?: string;
  ownerId?: string | null; ownerName?: string | null; openedDay?: number | null; idleMonths?: number;
  workers?: { id: string; name: string }[]; premisesId?: string | null;
}
export interface Employment { labourSupply: number; employed: number; unemployed: number; vacancies: number; wageBillPerMonth: number }
export interface SectorEmployment { sector: string; businesses: number; demand: number; filled: number }
export interface Need { id: string; label: string; value: number; status: 'ok' | 'strained' | 'critical'; explanation: string }
export interface Society {
  households: HouseholdGroup[]; housing: HousingStock[]; overcrowdedHouseholds: number; businesses: Business[];
  employment: Employment; sectors: SectorEmployment[]; needs: Need[];
}
export interface SettlementSimState {
  settlementId: string; sourceId: number; name: string; population: number; cohorts: Cohorts; births: number; deaths: number;
  society: Society;
  economy?: SettlementEconomy;
  /** From the summary endpoint, which sends this instead of the business list. */
  businessSummary?: BusinessSummary;
}
export interface Diagnostics {
  settlementId: string; name: string; businesses: number; ruralOperations: number; homeWorkshops: number; urbanPremises: number;
  dwellingBuildings: number; employeesPerBusiness: number; businessesPerThousand: number; urbanPremisesPerDwelling: number; flags: string[];
}
export interface BusinessSummary {
  count: number; professions: { profession: string; posts: number; filled: number }[];
  opened: { posts: number; filled: number }; guardPosts: number;
}
export interface HistoryPoint {
  day: number; population: Record<string, number>; labour?: Record<string, number>; unemployed?: Record<string, number>; bandits?: number;
}
export interface ScenarioState {
  schemaVersion: number; scenarioId: string; seed: number; startYear: number; date: CalendarDate;
  settlements: SettlementSimState[]; history: HistoryPoint[];
  trade?: { routes: TradeRoute[]; traders: Trader[] };
}

export interface SimEvent { seq: number; day: number; date: string; kind: string; message: string }
export interface SnapshotMeta { id: string; label: string; date: CalendarDate; checksum: string; createdAt: string }

export interface SimulationConfig {
  stepSizes: Record<'day' | 'week' | 'month' | 'year', number>;
  speeds: number[];
  startYear: number;
  scopeTypes: ScenarioScope['type'][];
  limits: { maxScopeSettlements: number };
  calendar?: { daysPerMonth: number; monthsPerYear: number };
}

/* ---- Economy and trade (GET /api/scenarios/{id}/economy) ---- */

export interface ProductionLine {
  good: string; source: 'workshop' | 'extraction' | 'hinterland'; units: number; inputs: Record<string, number>;
  produced: number; limitedBy: string | null;
}
export interface Shortage { good: string; wanted: number; obtained: number }
export interface FoodBalance {
  ruralPopulation: number; hinterlandCells: number; local: number; hinterland: number; eaten: number; wanted: number;
  security: number; selfSufficiency: number;
}
export interface SettlementEconomy {
  marketId: number | null; settlementClass: string; travelDays: number; baselinePopulation: number; inventory: Record<string, number>;
  production: ProductionLine[]; consumption: Record<string, number>; bought: Record<string, number>; sold: Record<string, number>;
  shortages: Shortage[]; food: FoodBalance; treasury: number; tradeBalance: number;
  taxPaid: number; escortCost: number; lostToBandits: number; businessSeq: number; opened: number; closed: number;
}
export interface MarketGood {
  basePrice: number; price: number; stock: number; outsideSupply: number; outsideDemand: number;
  demand: number; supplied: number; left: number;
}
export interface Market {
  marketId: number; centerSettlementId: string; centerName: string; centerInScope: boolean;
  goods: Record<string, MarketGood>; priceHistory: { day: number; prices: Record<string, number> }[];
  taxRates: Record<string, number>; taxRevenue: number;
}
export interface Caravan {
  id: string; kind: 'sale' | 'purchase'; marketId: number; fromId: string; fromName: string; toId: string; toName: string;
  cargo: Record<string, number>; value: number; departDay: number; arriveDay: number;
  routeId: string | null; traderId: string | null; traderName: string | null; guards: number;
  lost: Record<string, number>; smuggled: number; caught: boolean;
}
export interface TradeRoute {
  id: string; mode: 'land' | 'sea'; settlementId: string; settlementName: string; marketId: number; centerName: string; days: number;
  bandits: number; floor: number; lair: string | null; raidChance: number; guardsWanted: number; recruits: number; removed: number;
  loot: Record<string, number>; raids: number; lootValue: number; reserve: string[];
}
export interface Personality { greed: number; caution: number; honesty: number }
export interface Scorecard {
  trips: number; valueCarried: number; commission: number; taxPaid: number; taxEvaded: number; smuggled: number; caught: number;
  fines: number; raids: number; lossesValue: number; guardsHired: number; reputation: number;
  livingCosts: number; dividends: number; invested: number;
}
export interface Trader {
  id: string; name: string; settlementId: string; settlementName: string; routeId: string; personality: Personality;
  scorecard: Scorecard; household: { adults: number; children: number }; purse: number; owns: string[];
  busyUntil: number; active: boolean; dismissedDay: number | null;
}
export interface TraderDetail extends Trader {
  route: TradeRoute | null; caravans: Caravan[]; businesses: { id: string; name: string; filled: number; staff: number }[];
  personId?: string | null;
}

/* ---- Named people (GET /api/scenarios/{id}/people) ---- */

export type PersonRole = 'child' | 'worker' | 'unemployed' | 'retired' | 'trader' | 'outlaw' | 'imprisoned';
export interface PersonRow {
  id: string; name: string; family: string; sex: 'female' | 'male'; birthDay: number; age: number; settlementId: string;
  settlementName: string; householdId: string; role: PersonRole; businessId: string | null; workplace: string | null;
  profession: string | null; traderId: string | null; routeId: string | null; personality: Personality; idleMonths: number;
  releaseDay: number | null; alive: boolean; deathDay: number | null; cause: string | null;
}
export interface PeopleMeta extends PageMeta {
  roles: Record<string, number>; deaths: number; births: number; arrivals: number;
  settlements: { id: string; name: string; budget: number }[];
}
export interface PersonDetail extends PersonRow {
  events: { day: number; kind: string; text: string }[];
  household: { id: string; family: string; kind: string; housing: string; members: { id: string; name: string; age: number; role: string; alive: boolean }[] };
  route: TradeRoute | null;
}
export interface EconomyView {
  date: CalendarDate;
  settlements: { settlementId: string; name: string; population: number; economy: SettlementEconomy }[];
  markets: Market[];
  caravans: Caravan[];
  delivered: Caravan[];
  routes: TradeRoute[];
  traders: Trader[];
}
