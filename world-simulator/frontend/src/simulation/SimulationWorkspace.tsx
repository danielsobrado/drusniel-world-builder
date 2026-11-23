import { useState, type FormEvent } from 'react';
import type { ScenarioState, SimEvent, SnapshotMeta, Summary } from '../api/types';
import { useApi } from '../api/worldApi';
import { fmt, shortHash } from '../components/format';
import { ApiView, Empty, ErrorState } from '../components/StateViews';
import { PopulationTrend } from './PopulationTrend';
import type { Simulation } from './useSimulation';

const BANDS = [['children', 'Children'], ['adults', 'Adults'], ['elders', 'Elders']] as const;

function SettlementStates({ state, onSelect }: { state: ScenarioState; onSelect: (id: string) => void }) {
  const start = state.history[0]?.population ?? {};
  return (
    <table className="grid" aria-label="Settlement state">
      <thead>
        <tr><th>Settlement</th><th className="num">Population</th><th className="num">Change</th><th>Age bands</th>
          <th className="num">Births</th><th className="num">Deaths</th></tr>
      </thead>
      <tbody>
        {state.settlements.map((s) => {
          const change = s.population - (start[s.settlementId] ?? s.population);
          return (
            <tr key={s.settlementId} onClick={() => onSelect(s.settlementId)} tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(s.settlementId); }}>
              <td>{s.name}</td>
              <td className="num">{fmt(s.population)}</td>
              <td className={`num ${change < 0 ? 'bad' : change > 0 ? 'good' : ''}`}>{change > 0 ? '+' : ''}{fmt(change)}</td>
              <td>
                <div className="cohort-bar" title={BANDS.map(([k, l]) => `${l} ${fmt(s.cohorts[k])}`).join(' · ')}>
                  {BANDS.map(([k]) => <span key={k} className={`cohort cohort-${k}`} style={{ flexGrow: s.cohorts[k] }} />)}
                </div>
              </td>
              <td className="num">{fmt(s.births)}</td>
              <td className="num">{fmt(s.deaths)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Snapshots({ sim, version }: { sim: Simulation; version: string }) {
  const id = sim.active!.id;
  const list = useApi<SnapshotMeta[]>(`/api/scenarios/${encodeURIComponent(id)}/snapshots?v=${version}`);
  const [label, setLabel] = useState('');
  const running = sim.active!.running;
  const locked = Boolean(sim.active!.readOnly);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (await sim.snapshot(label)) setLabel('');
  };
  const branch = (s: SnapshotMeta) => sim.create({ name: `${sim.active!.name} · ${s.label}`, fromScenarioId: id, fromSnapshotId: s.id });
  return (
    <div>
      <form className="inline-form" onSubmit={save}>
        <input aria-label="Snapshot label" placeholder="Snapshot label (optional)" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" className="btn" disabled={sim.busy || locked}>Save snapshot</button>
      </form>
      <ApiView result={list} loadingLabel="Loading snapshots…">
        {(snaps) => (snaps.length === 0 ? <Empty>No snapshots yet.</Empty> : (
          <ul className="snapshots">
            {snaps.map((s) => (
              <li key={s.id}>
                <span><b>{s.label}</b> <span className="muted">{s.date.label} · {s.checksum}</span></span>
                <span>
                  <button type="button" className="btn btn-compact" disabled={running || sim.busy || locked} title={running ? 'Pause first' : undefined}
                    onClick={() => void sim.restore(s.id)}>Restore</button>
                  <button type="button" className="btn btn-compact" disabled={sim.busy || locked} onClick={() => void branch(s)}>Branch</button>
                </span>
              </li>
            ))}
          </ul>
        ))}
      </ApiView>
    </div>
  );
}

function NewScenario({ sim, summary }: { sim: Simulation; summary: Summary | null }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('pilot');
  const [seed, setSeed] = useState('1212');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { name: name.trim(), seed: Number(seed), scope: scope === 'pilot' ? { type: 'pilot' } : { type: 'state', id: scope } };
    if (await sim.create(body)) setName('');
  };
  return (
    <form className="new-scenario" onSubmit={submit}>
      <label>Name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Scope
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="pilot">Pilot (3 settlements)</option>
          {summary?.states.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.settlementCount})</option>)}
        </select>
      </label>
      <label>Seed<input type="number" required value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
      <button type="submit" className="btn" disabled={sim.busy || !name.trim()}>Create</button>
    </form>
  );
}

function EventLog({ events }: { events: SimEvent[] }) {
  if (events.length === 0) return <Empty>No events yet.</Empty>;
  return (
    <ol className="event-log">
      {events.map((e) => (
        <li key={e.seq} className={`event event-${e.kind}`}><span className="event-date">{e.date}</span><span className="event-kind">{e.kind}</span>{e.message}</li>
      ))}
    </ol>
  );
}

/** The Simulation workspace: clock, settlement state, trend, events, snapshots and new scenarios. */
export function SimulationWorkspace({ sim, summary, onSelect }: { sim: Simulation; summary: Summary | null; onSelect: (id: string) => void }) {
  const active = sim.active;
  const path = active ? `/api/scenarios/${encodeURIComponent(active.id)}` : null;
  const state = useApi<ScenarioState>(path && `${path}/summary?v=${sim.version}`);
  const events = useApi<SimEvent[]>(path && `${path}/events?limit=60&v=${sim.version}`);
  return (
    <>
      {sim.error && (
        <div className="section"><ErrorState error={sim.error} onRetry={sim.clearError} /></div>
      )}
      {!active ? <Empty>No scenario yet; create one below.</Empty> : (
        <section className="section">
          <div className="section-head">
            <h2>{active.name}</h2>
            <span className={`badge ${active.running ? 'badge-good' : ''}`}>{active.running ? `running · ${active.speed} d/s` : 'paused'}</span>
            <span className="muted">{active.date.label} · day {active.date.day} · seed {active.seed} · state {shortHash(active.checksum)}</span>
            {active.parent && <span className="muted">branched from {active.parent.scenarioId} / {active.parent.snapshotId}</span>}
          </div>
          {active.readOnly && <p className="warn" role="status">Read-only: {active.readOnly}</p>}
          <ApiView result={state} loadingLabel="Loading state…">
            {(s) => <>
              <div className="tiles">
                <div className="tile"><div className="tile-label">Population</div><div className="tile-value">{fmt(active.population)}</div>
                  <div className="tile-note">{s.settlements.length} settlements in scope</div></div>
                <div className="tile"><div className="tile-label">Births · deaths</div>
                  <div className="tile-value">{fmt(s.settlements.reduce((a, x) => a + x.births, 0))} · {fmt(s.settlements.reduce((a, x) => a + x.deaths, 0))}</div>
                  <div className="tile-note">since {s.startYear}-01-01</div></div>
              </div>
              <h4>Population trend</h4>
              <PopulationTrend state={s} />
              <h4>Settlements</h4>
              <SettlementStates state={s} onSelect={onSelect} />
              <p className="muted small">Monthly demography uses authored rates from config/simulation.yaml (assumptions, not calibrated data).</p>
            </>}
          </ApiView>
        </section>
      )}
      {active && (
        <div className="split">
          <section className="section"><div className="section-head"><h2>Snapshots</h2></div><Snapshots sim={sim} version={sim.version} /></section>
          <section className="section"><div className="section-head"><h2>Event log</h2></div>
            <ApiView result={events} loadingLabel="Loading events…">{(list) => <EventLog events={list} />}</ApiView></section>
        </div>
      )}
      <section className="section">
        <div className="section-head"><h2>New scenario</h2><span className="muted">Starts from the imported world on 1 Jan of the source year</span></div>
        <NewScenario sim={sim} summary={summary} />
      </section>
    </>
  );
}
