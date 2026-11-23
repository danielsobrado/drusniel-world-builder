import { useCallback, useEffect, useState } from 'react';
import { getJson } from '../api/worldApi';

export interface LlmStatus {
  mode: 'llm' | 'draft'; provider: string; model: string; hint: string | null; reachable: boolean; models: string[];
  baseUrl?: string | null; jobs: { queued: number; running: number; done: number; failed: number };
}

/** The local model's status and job counts; polls quickly while jobs are waiting, slowly otherwise. */
export function useLlm(): { status: LlmStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    getJson<LlmStatus>('/api/llm').then((b) => { if (alive) setStatus(b.data); }).catch(() => { if (alive) setStatus(null); });
    return () => { alive = false; };
  }, [tick]);
  const busy = Boolean(status && status.jobs.queued + status.jobs.running);
  useEffect(() => {
    const id = window.setInterval(refresh, busy ? 2000 : 15000);
    return () => window.clearInterval(id);
  }, [busy, refresh]);
  return { status, refresh };
}

export function llmLabel(status: LlmStatus | null): string {
  if (!status) return 'Local LLM: …';
  return status.mode === 'llm' ? `Local LLM: ${status.model}` : 'Local LLM: draft writer';
}
