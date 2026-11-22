import { useCallback, useEffect, useState } from 'react';
import type { ScenarioStatus, SimulationConfig, SnapshotMeta } from '../api/types';
import { ApiRequestError, getJson, postJson, useApi } from '../api/worldApi';

const KEY = 'drusniel-world-simulator.activeScenario.v1';

function readActive(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export interface Simulation {
  config: SimulationConfig | null;
  scenarios: ScenarioStatus[];
  active: ScenarioStatus | null;
  /** Changes whenever the active scenario's state changes; append to state/event URLs to refetch. */
  version: string;
  busy: boolean;
  error: ApiRequestError | null;
  select: (id: string) => void;
  step: (unit: 'day' | 'week' | 'month' | 'year') => Promise<void>;
  run: (speed: number) => Promise<void>;
  pause: () => Promise<void>;
  snapshot: (label: string) => Promise<SnapshotMeta | null>;
  restore: (snapshotId: string) => Promise<void>;
  create: (body: Record<string, unknown>) => Promise<ScenarioStatus | null>;
  clearError: () => void;
}

/** Scenario list, the active scenario and its controls. Polls once a second while a scenario runs. */
export function useSimulation(): Simulation {
  const configResult = useApi<SimulationConfig>('/api/simulation');
  const [scenarios, setScenarios] = useState<ScenarioStatus[]>([]);
  const [activeId, setActiveId] = useState<string | null>(readActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await getJson<ScenarioStatus[]>('/api/scenarios');
      setScenarios(data);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, 'network_error', String(e)));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0] ?? null;
  const running = Boolean(active?.running);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => { void refresh(); }, 1000);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const select = useCallback((id: string) => {
    setActiveId(id);
    try { localStorage.setItem(KEY, id); } catch { /* not remembered in private mode */ }
  }, []);

  /** Runs one write; errors land in `error` instead of throwing into the UI. */
  const act = useCallback(async <T,>(path: string, body: unknown = {}): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await postJson<T>(path, body);
      await refresh();
      return data;
    } catch (e) {
      setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, 'network_error', String(e)));
      return null;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const base = active ? `/api/scenarios/${encodeURIComponent(active.id)}` : '';
  return {
    config: configResult.data,
    scenarios,
    active,
    version: active ? `${active.id}:${active.eventSeq}:${active.date.day}:${active.checksum}` : '',
    busy,
    error: error ?? configResult.error,
    select,
    step: async (unit) => { if (active) await act(`${base}/step`, { unit }); },
    run: async (speed) => { if (active) await act(`${base}/run`, { speed }); },
    pause: async () => { if (active) await act(`${base}/pause`); },
    snapshot: async (label) => (active ? act<SnapshotMeta>(`${base}/snapshots`, { label }) : null),
    restore: async (snapshotId) => { if (active) await act(`${base}/restore`, { snapshotId }); },
    create: async (body) => {
      const created = await act<ScenarioStatus>('/api/scenarios', body);
      if (created) select(created.id);
      return created;
    },
    clearError: () => setError(null),
  };
}
