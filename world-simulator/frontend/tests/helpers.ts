import { vi } from 'vitest';
import type { SettlementClass, Society } from '../src/api/types';

type MockValue = unknown | { status: number; error: { code: string; message: string } } | { data: unknown; meta?: unknown };
type Route = MockValue | ((url: string, init?: RequestInit) => MockValue);

const envelope = (data: unknown, meta?: unknown) => ({ apiVersion: 1, world: { mapId: 'test', sourceFingerprint: 'sha256:0' }, data, meta });
const isError = (v: unknown): v is { status: number; error: unknown } => typeof v === 'object' && v !== null && 'status' in v && 'error' in v;
const hasData = (v: unknown): v is { data: unknown; meta?: unknown } => typeof v === 'object' && v !== null && 'data' in v;

/** Stubs fetch: `routes` maps a path prefix to data, { data, meta }, { status, error }, or a function of the URL. */
export function mockApi(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => url.startsWith(k));
    if (key === undefined) {
      return new Response(JSON.stringify({ apiVersion: 1, error: { code: 'not_found', message: `No mock for ${url}` } }), { status: 404 });
    }
    const route = routes[key];
    const value = typeof route === 'function' ? (route as (u: string, i?: RequestInit) => MockValue)(url, init) : route;
    if (isError(value)) return new Response(JSON.stringify({ apiVersion: 1, error: value.error }), { status: value.status });
    return new Response(JSON.stringify(hasData(value) ? envelope(value.data, value.meta) : envelope(value)), { status: 200 });
  }));
  return calls;
}

export const classes: SettlementClass[] = [
  { id: 'named-village', label: 'Named village', maxPopulation: 1000 }, { id: 'small-town', label: 'Small town', maxPopulation: 3000 },
  { id: 'town', label: 'Town', maxPopulation: 8000 }, { id: 'large-town', label: 'Large town', maxPopulation: 15000 },
  { id: 'city', label: 'City', maxPopulation: 25000 }, { id: 'major-city', label: 'Major city', maxPopulation: null },
];

/** A small but internally consistent settlement society. */
export function society(): Society {
  return {
    households: [
      { kind: 'couple-with-children', label: 'Couple with children', households: 10, adults: 20, children: 24, elders: 0 },
      { kind: 'elder-single', label: 'Elder living alone', households: 4, adults: 0, children: 0, elders: 4 },
    ],
    housing: [
      { type: 'cottage', label: 'Cottage', buildings: 12, capacity: 12, occupied: 12, vacant: 0 },
      { type: 'townhouse', label: 'Townhouse', buildings: 1, capacity: 2, occupied: 1, vacant: 1 },
    ],
    overcrowdedHouseholds: 1,
    businesses: [
      { id: 'business:azgaar-burg:238:farm:1', settlementId: 'settlement:azgaar-burg:238', kind: 'farm', name: 'Vhaltha Farm', sector: 'agriculture',
        profession: 'farmhand', good: null, staff: 8, wage: 3, filled: 8, evidence: null },
      { id: 'business:azgaar-burg:238:workshop-tools:1', settlementId: 'settlement:azgaar-burg:238', kind: 'workshop', name: 'Vhaltha Tools workshop',
        sector: 'crafts', profession: 'artisan', good: 'Tools', staff: 5, wage: 5, filled: 3, evidence: 'Azgaar records crafting of Tools' },
    ],
    employment: { labourSupply: 11, employed: 11, unemployed: 0, vacancies: 2, wageBillPerMonth: 1170 },
    sectors: [{ sector: 'agriculture', businesses: 1, demand: 8, filled: 8 }, { sector: 'crafts', businesses: 1, demand: 5, filled: 3 }],
    needs: [
      { id: 'food', label: 'Local food self-sufficiency', value: 0.5, status: 'critical', explanation: '8 agriculture workers grow 26 of 48 daily rations.' },
      { id: 'housing', label: 'Housing', value: 0.93, status: 'ok', explanation: '1 of 14 households have no free dwelling.' },
    ],
  };
}
