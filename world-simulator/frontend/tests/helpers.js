import { vi } from 'vitest';

const envelope = (data, meta) => ({ apiVersion: 1, world: { mapId: 'test', sourceFingerprint: 'sha256:0' }, data, meta });

/** Stubs fetch: `routes` maps a path prefix to data, a function of the URL, or an Error-like { status, error }. */
export function mockApi(routes) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => url.startsWith(k));
    const value = typeof routes[key] === 'function' ? routes[key](url) : routes[key];
    if (!key) return new Response(JSON.stringify({ apiVersion: 1, error: { code: 'not_found', message: `No mock for ${url}` } }), { status: 404 });
    if (value?.status) return new Response(JSON.stringify({ apiVersion: 1, error: value.error }), { status: value.status });
    return new Response(JSON.stringify(envelope(value.data ?? value, value.meta)), { status: 200 });
  }));
  return calls;
}

export const classes = [
  { id: 'named-village', label: 'Named village' }, { id: 'small-town', label: 'Small town' }, { id: 'town', label: 'Town' },
  { id: 'large-town', label: 'Large town' }, { id: 'city', label: 'City' }, { id: 'major-city', label: 'Major city' },
];
