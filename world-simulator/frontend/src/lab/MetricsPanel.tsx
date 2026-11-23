import { useApi } from '../api/worldApi';
import { fmt } from '../components/format';
import { ApiView } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import type { Metrics, Stats } from './types';

const num = (v: number | null, unit: string) => (v === null ? '–' : `${v}${unit}`);
const stats = (s: Stats, unit: string) => `${num(s.mean, unit)} mean · ${num(s.p95, unit)} p95 · ${num(s.last, unit)} last`;

/** How fast the simulation steps and the local model answers, and how big the scenario has grown. */
export function MetricsPanel({ sim }: { sim: Simulation }) {
  const active = sim.active!;
  const result = useApi<Metrics>(`/api/scenarios/${encodeURIComponent(active.id)}/metrics?v=${sim.version}`);
  return (
    <ApiView result={result} loadingLabel="Measuring…">
      {(m) => (
        <dl className="kv metrics" aria-label="Performance">
          <dt>Simulated month</dt>
          <dd>{m.steps.months ? stats(m.steps.msPerMonth, ' ms') : 'Step the scenario to measure.'}
            {m.steps.months > 0 && <span className="muted small"> over {fmt(m.steps.months)} months in {fmt(m.steps.count)} steps since the server started</span>}</dd>
          <dt>Scenario size</dt>
          <dd>{fmt(m.size.alive)} of {fmt(m.size.people)} named people alive · {fmt(m.size.relationships)} relationships · {fmt(m.size.events)} events · state {fmt(m.size.stateKb)} KB
            {m.size.journal !== null ? ` · journal ${fmt(m.size.journal)} commands` : ' · no journal'}</dd>
          <dt>Local model</dt>
          <dd>{m.llm.calls === 0 ? 'No calls yet.' : Object.entries(m.llm.byKind).map(([k, s]) => (
            <div key={k}><strong>{k}</strong> ×{s.count}: {stats(s, ' s')}</div>))}</dd>
        </dl>
      )}
    </ApiView>
  );
}
