import { useState } from 'react';
import { ApiRequestError, postJson, useApi } from '../api/worldApi';
import { fmt, shortHash } from '../components/format';
import { ApiView } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import type { ReplayResult, Validation } from './types';

function Replay({ sim }: { sim: Simulation }) {
  const active = sim.active!;
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true); setError(null);
    try {
      setResult((await postJson<ReplayResult>(`/api/scenarios/${encodeURIComponent(active.id)}/replay`)).data);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };
  const stale = result && result.date !== active.date.label;
  return (
    <div className="replay">
      <div className="lab-actions">
        <button type="button" className="btn" onClick={() => void run()} disabled={running || active.replayable === false}>
          {running ? 'Replaying…' : 'Replay from the baseline'}</button>
        <span className="muted small">{active.replayable === false
          ? 'No complete journal: made before PR8, migrated, or branched from such a scenario.'
          : 'Rebuilds the start from the map, seed and frozen rules, re-applies every step and intervention, and compares.'}</span>
      </div>
      {error && <p className="status status-critical small">{error}</p>}
      {result && !result.replayable && <p className="muted small">{result.reason}</p>}
      {result?.replayable && (
        <div className={`replay-result ${result.matches ? 'ok' : 'bad'}`} role="status">
          <strong>{result.matches ? 'Identical' : 'Different'}</strong>{' '}
          <span>{fmt(result.commands ?? 0)} commands to {result.date}, replayed in {result.seconds}s{stale ? ' (the scenario has moved on since)' : ''}</span>
          <dl className="kv small">
            <dt>State</dt><dd>{shortHash(result.state!.live)} · replayed {shortHash(result.state!.replayed)} {result.state!.matches ? '✓' : '✗'}</dd>
            <dt>History</dt><dd>{fmt(result.history!.liveCount)} events · replayed {fmt(result.history!.replayedCount)} {result.history!.matches ? '✓' : '✗'}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

/** Deterministic replay and the consistency checks between state and history. */
export function ChecksPanel({ sim }: { sim: Simulation }) {
  const active = sim.active!;
  const report = useApi<Validation>(`/api/scenarios/${encodeURIComponent(active.id)}/validation?v=${sim.version}`);
  return (
    <>
      <Replay sim={sim} />
      <ApiView result={report} loadingLabel="Checking state and history…">
        {(v) => (
          <div>
            <table className="grid checks" aria-label="Consistency checks">
              <thead><tr><th>Check</th><th className="num">Checked</th><th>Result</th></tr></thead>
              <tbody>{v.checks.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td><td className="num">{fmt(c.checked)}</td>
                  <td>{c.passed ? <span className="status status-ok">passed</span>
                    : <details><summary className="status status-critical">{fmt(c.problemCount)} problem(s)</summary>
                      <ul className="small">{c.problems.map((p) => <li key={p}>{p}</li>)}</ul></details>}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="muted small">Checked at {v.date} in {v.seconds}s.</p>
          </div>
        )}
      </ApiView>
    </>
  );
}
