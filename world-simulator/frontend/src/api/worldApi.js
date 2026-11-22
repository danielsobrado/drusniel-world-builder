import { useCallback, useEffect, useState } from 'react';

export class ApiRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}

/** GETs a JSON envelope; non-2xx responses become ApiRequestError with the server's code. */
export async function getJson(path, { signal } = {}) {
  const res = await fetch(path, { signal, headers: { accept: 'application/json' } });
  let body;
  try {
    body = await res.json();
  } catch {
    throw new ApiRequestError(res.status, 'bad_response', `Backend returned a non-JSON response for ${path} (status ${res.status})`);
  }
  if (!res.ok) throw new ApiRequestError(res.status, body?.error?.code ?? 'error', body?.error?.message ?? `Request failed (${res.status})`);
  return body;
}

export const paths = {
  health: '/api/health',
  world: '/api/world',
  summary: '/api/world/summary',
  connectivity: '/api/world/connectivity',
  budget: '/api/world/npc-budget',
  pilot: '/api/world/pilot',
  settlement: (id) => `/api/world/settlements/${encodeURIComponent(id)}`,
  settlements(query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
    }
    return `/api/world/settlements?${params}`;
  },
};

/** Loads `path` (null = idle); stale responses are aborted when the path changes. */
export function useApi(path) {
  const [state, setState] = useState({ body: null, error: null, loading: Boolean(path) });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) { setState({ body: null, error: null, loading: false }); return undefined; }
    const controller = new AbortController();
    setState((s) => ({ body: s.body, error: null, loading: true }));
    getJson(path, { signal: controller.signal })
      .then((body) => setState({ body, error: null, loading: false }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ body: null, error, loading: false }); });
    return () => controller.abort();
  }, [path, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, data: state.body?.data ?? null, meta: state.body?.meta ?? null, reload };
}
