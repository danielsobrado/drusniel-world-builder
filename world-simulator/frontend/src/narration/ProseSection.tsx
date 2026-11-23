import { useEffect, useState } from 'react';
import { getJson, postJson } from '../api/worldApi';

interface Biography {
  person: string; kind: string; text: string; provider: string; model: string; created: string; warnings: string[]; stale: boolean;
}
interface Job { id: number; personId: string; kind: string; status: string; error: string | null }

const KINDS: [string, string][] = [['short', 'Short biography'], ['detailed', 'Detailed biography'], ['style', 'How they speak'],
  ['self', 'In their own words']];

/** Prose written from the biography facts: generate, regenerate, and see what the fact check found. */
export function ProseSection({ scenarioId, personId }: { scenarioId: string; personId: string }) {
  const base = `/api/scenarios/${encodeURIComponent(scenarioId)}/people/${encodeURIComponent(personId)}/biographies`;
  const [bios, setBios] = useState<Biography[]>([]);
  const [pending, setPending] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    getJson<Biography[]>(base).then((b) => { if (alive) setBios(b.data); }).catch((e: Error) => { if (alive) setError(e.message); });
    getJson<Job[]>(`/api/llm/jobs?scenario=${encodeURIComponent(scenarioId)}`).then((b) => {
      if (alive) setPending(b.data.filter((j) => j.personId === personId && (j.status === 'queued' || j.status === 'running')));
    }).catch(() => {});
    return () => { alive = false; };
  }, [base, scenarioId, personId, tick]);
  useEffect(() => {
    if (!pending.length) return undefined;
    const id = window.setTimeout(() => setTick((n) => n + 1), 1500);
    return () => window.clearTimeout(id);
  }, [pending, tick]);
  const write = (kinds: string[]) => {
    setError(null);
    postJson<Job[]>(base, { kinds }).then(() => setTick((n) => n + 1)).catch((e: Error) => setError(e.message));
  };
  const byKind = new Map(bios.map((b) => [b.kind, b]));
  return (
    <div className="prose">
      <div className="inline-form">
        <button type="button" className="btn" disabled={pending.length > 0} onClick={() => write(KINDS.map(([k]) => k))}>
          {bios.length ? 'Rewrite all' : 'Write all'}</button>
        {pending.length > 0 && <span className="muted small">writing {pending.length}…</span>}
        {error && <span className="status status-critical">{error}</span>}
      </div>
      {KINDS.map(([kind, label]) => {
        const b = byKind.get(kind);
        return (
          <article key={kind} className="prose-card" aria-label={label}>
            <header className="prose-head">
              <h4>{label}</h4>
              {b && <span className="muted small">{b.provider === 'draft' ? 'draft writer, no model' : b.model} · {b.created.slice(0, 10)}</span>}
              {b?.stale && <span className="chip chip-warn" title="The person's record has moved on since this was written">stale</span>}
              <span className="appbar-spacer" />
              <button type="button" className="btn btn-compact" disabled={pending.some((j) => j.kind === kind)} onClick={() => write([kind])}>
                {b ? 'Regenerate' : 'Write'}</button>
            </header>
            {b ? <p className="prose-text">{b.text}</p> : <p className="muted small">Not written yet.</p>}
            {b && b.warnings.length > 0 && (
              <ul className="prose-warnings" aria-label={`${label} fact check`}>
                {b.warnings.map((w) => <li key={w} className="status status-strained">{w}</li>)}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}
