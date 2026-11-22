import { useCallback, useEffect, useState } from 'react';
import type { Envelope } from './types';

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Sends a request and unwraps the envelope; non-2xx responses become ApiRequestError with the server's code. */
export async function requestJson<T, M = undefined>(path: string, init: RequestInit = {}): Promise<Envelope<T, M>> {
  const res = await fetch(path, { ...init, headers: { accept: 'application/json', ...(init.headers ?? {}) } });
  let body: { error?: { code?: string; message?: string } } & Partial<Envelope<T, M>>;
  try {
    body = await res.json();
  } catch {
    throw new ApiRequestError(res.status, 'bad_response', `Backend returned a non-JSON response for ${path} (status ${res.status})`);
  }
  if (!res.ok) throw new ApiRequestError(res.status, body?.error?.code ?? 'error', body?.error?.message ?? `Request failed (${res.status})`);
  return body as Envelope<T, M>;
}

export const getJson = <T, M = undefined>(path: string, signal?: AbortSignal) => requestJson<T, M>(path, { signal });

/** POSTs JSON; the content type also makes cross-site browser posts need a preflight the API never grants. */
export const postJson = <T>(path: string, body: unknown = {}) =>
  requestJson<T>(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

export const paths = {
  health: '/api/health',
  world: '/api/world',
  summary: '/api/world/summary',
  connectivity: '/api/world/connectivity',
  budget: '/api/world/npc-budget',
  pilot: '/api/world/pilot',
  settlement: (id: string) => `/api/world/settlements/${encodeURIComponent(id)}`,
  settlements(query: Record<string, string | number | null | undefined>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
    }
    return `/api/world/settlements?${params}`;
  },
};

export interface ApiResult<T, M = undefined> {
  data: T | null;
  meta: M | null;
  error: ApiRequestError | null;
  loading: boolean;
  reload: () => void;
}

/** Loads `path` (null = idle); stale responses are aborted when the path changes. */
export function useApi<T, M = undefined>(path: string | null): ApiResult<T, M> {
  const [state, setState] = useState<{ body: Envelope<T, M> | null; error: ApiRequestError | null; loading: boolean }>(
    { body: null, error: null, loading: Boolean(path) });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) { setState({ body: null, error: null, loading: false }); return undefined; }
    const controller = new AbortController();
    setState((s) => ({ body: s.body, error: null, loading: true }));
    getJson<T, M>(path, controller.signal)
      .then((body) => setState({ body, error: null, loading: false }))
      .catch((error: Error) => {
        if (error.name === 'AbortError') return;
        const apiError = error instanceof ApiRequestError ? error : new ApiRequestError(0, 'network_error', error.message);
        setState({ body: null, error: apiError, loading: false });
      });
    return () => controller.abort();
  }, [path, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data: state.body?.data ?? null, meta: state.body?.meta ?? null, error: state.error, loading: state.loading, reload };
}
