import { vi } from 'vitest';
import type { SettlementClass } from '../src/api/types';

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
