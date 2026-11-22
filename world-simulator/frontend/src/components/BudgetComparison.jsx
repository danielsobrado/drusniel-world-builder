import { useState } from 'react';
import { paths, useApi } from '../api/worldApi.js';
import { classLabel, fmt, pct } from './format.js';
import { ApiView } from './StateViews.jsx';

function ScenarioCard({ s, active, configured, onPick }) {
  return (
    <button type="button" className={`scenario${active ? ' active' : ''}`} onClick={onPick} aria-pressed={active}>
      <div className="scenario-head">
        <span>Target <b>{fmt(s.target)}</b>{configured && <span className="badge">configured</span>}</span>
        <span className={`badge ${s.feasible ? 'badge-good' : 'badge-bad'}`}>{s.feasible ? 'feasible' : 'infeasible'}</span>
      </div>
      <div className="scenario-value">{fmt(s.allocated)} <span className="muted">allocated</span></div>
      <div className="muted">Bounds {fmt(s.minimumTotal)}–{fmt(s.maximumTotal)} · {s.settlementsAtMaximum} at cap · {s.settlementsAtMinimum} at minimum · coverage {pct(s.coverage)}</div>
      {s.reason && <p className="warn">{s.reason}</p>}
    </button>
  );
}

export function BudgetComparison({ classes }) {
  const result = useApi(paths.budget);
  const [picked, setPicked] = useState(null);
  return (
    <ApiView result={result} loadingLabel="Loading NPC budget…">
      {(budget) => {
        const current = budget.scenarios.find((s) => s.target === (picked ?? budget.configuredTarget)) ?? budget.scenarios[0];
        const maxClass = Math.max(...budget.scenarios.flatMap((s) => s.byClass.map((c) => c.npcs)), 1);
        const classIds = classes?.map((c) => c.id) ?? current.byClass.map((c) => c.key);
        return (
          <>
            <section className="section">
              <div className="section-head">
                <h2>Persistent NPC budget</h2>
                <span className="muted">Targets come from config/npc-population.yaml; allocations are computed by the audit.</span>
              </div>
              <div className="scenarios">
                {budget.scenarios.map((s) => (
                  <ScenarioCard key={s.target} s={s} active={s === current} configured={s.target === budget.configuredTarget} onPick={() => setPicked(s.target)} />
                ))}
              </div>
            </section>
            <section className="section">
              <div className="section-head"><h2>By settlement class</h2><span className="muted">NPCs per scenario; class range in brackets</span></div>
              <table className="bars" aria-label="NPC budget by class">
                <thead><tr><th>Class</th>{budget.scenarios.map((s) => <th key={s.target}>Target {fmt(s.target)}</th>)}</tr></thead>
                <tbody>
                  {classIds.map((id) => (
                    <tr key={id}>
                      <th scope="row">{classLabel(classes, id)} <span className="muted">[{budget.ranges[id].min}–{budget.ranges[id].max}]</span></th>
                      {budget.scenarios.map((s) => {
                        const row = s.byClass.find((c) => c.key === id) ?? { npcs: 0, settlements: 0 };
                        return <td key={s.target}><div className="bar"><span style={{ width: `${(row.npcs / maxClass) * 100}%` }} /><b>{fmt(row.npcs)}</b></div></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="section">
              <div className="section-head"><h2>By state · target {fmt(current.target)}</h2><span className="muted">Pick a scenario above to switch</span></div>
              <table className="grid" aria-label="NPC budget by state">
                <thead><tr><th>State</th><th className="num">Settlements</th><th className="num">Named population</th><th className="num">NPCs</th><th className="num">NPCs per 10k</th></tr></thead>
                <tbody>
                  {current.byState.map((row) => (
                    <tr key={row.key}>
                      <td>{row.key}</td><td className="num">{row.settlements}</td><td className="num">{fmt(row.population)}</td>
                      <td className="num">{fmt(row.npcs)}</td><td className="num">{(row.npcs / row.population * 10000).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Weights: sqrt(population) × capital {budget.importance.capital} × port {budget.importance.port} × market centre {budget.importance.marketCenter}.</p>
            </section>
          </>
        );
      }}
    </ApiView>
  );
}
