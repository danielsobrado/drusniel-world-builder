export interface CivicIdentity {
  cultureId: string | null;
  cultureSeedId: string | null;
  polityId: string | null;
  faithId: string | null;
}

export interface AncestryDefinition {
  label: string;
  ages?: Record<string, [number, number]>;
  retireFrom?: number;
  fertilityAges?: [number, number];
  foodMultiplier?: number;
  [parameter: string]: unknown;
}

export interface CultureDefinition {
  id: string;
  status: 'core' | 'seed';
  displayName: string;
  identity?: { public: string };
  ancestry?: string;
  ancestryWeights?: Record<string, number>;
  values?: string[];
  rule?: string;
  culturalPressure?: string;
  relations?: Record<string, { stance: string; pressurePoints: string[]; ties: string[] }>;
  futureCultureCandidates?: string[];
}

export interface Institution { id: string; label: string; assetId: string; demand: string; environment?: string }
export interface CultureProfile { preferences?: Record<string, number>; institutions?: Institution[] }
export interface AgeBands { children: number; adults: number; elders: number }

export interface PeoplesSettlement {
  id: string;
  name: string;
  population: number;
  identity: CivicIdentity;
  ancestries: Record<string, AgeBands>;
  infrastructure: { institutionId: string; assetId: string; demand: number }[];
  x: number | null;
  y: number | null;
  polity: string | null;
}

export interface PeoplesData {
  catalogId: string | null;
  ancestries: Record<string, AncestryDefinition>;
  cultures: Record<string, CultureDefinition>;
  profiles: Record<string, CultureProfile>;
  comparisonScenarios: string[];
  settlements: PeoplesSettlement[];
  history: { day: number; population: Record<string, Record<string, number>> }[];
  neutralParameters: { demography: Record<string, unknown>; ages: Record<string, [number, number]> };
}

export type PeoplesSelection = { type: 'ancestry'; id: string } | { type: 'culture'; id: string }
  | { type: 'institution'; id: string; cultureId: string };

export function cultureOf(town: PeoplesSettlement) {
  return town.identity.cultureId ?? town.identity.cultureSeedId;
}

export function population(bands?: AgeBands) {
  return bands ? bands.children + bands.adults + bands.elders : 0;
}

export function formatKey(id: string) {
  return id.replaceAll('-', ' ').replace(/^./, (first) => first.toUpperCase());
}
