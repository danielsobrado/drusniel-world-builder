import { fmt } from '../components/format';
import type { Simulation } from './useSimulation';

/** Left panel in the Simulation workspace: every scenario, its date and whether it runs. */
export function ScenarioExplorer({ sim }: { sim: Simulation }) {
  return (
    <aside className="explorer" aria-label="Scenario explorer">
      <div className="panel-title">Scenarios</div>
      <ul className="tree">
        {sim.scenarios.map((s) => (
          <li key={s.id}>
            <button type="button" className={`tree-leaf scenario-leaf${s.id === sim.active?.id ? ' selected' : ''}`} onClick={() => sim.select(s.id)}>
              <span className={`dot ${s.running ? 'dot-good' : s.error ? 'dot-bad' : 'dot-idle'}`} aria-label={s.running ? 'running' : 'paused'} />
              <span className="scenario-name">{s.name}{s.parent && <span className="muted"> · branch</span>}</span>
              <span className="tree-count">{s.date.label}</span>
            </button>
            <div className="scenario-sub muted">{s.settlementIds.length} settlements · {fmt(s.population)} people · {s.snapshots} snapshots</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
