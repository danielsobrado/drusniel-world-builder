import { useState } from 'react';
import type { SettlementSimState } from '../api/types';
import { fmt, pct } from '../components/format';
import { ApiView, Empty } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import { NeedsPanel, SettlementPicker, ShareBar, useScenarioState } from './SocietyParts';

function Overview({ s }: { s: SettlementSimState }) {
  const soc = s.society;
  const households = soc.households.reduce((a, g) => a + g.households, 0);
  const capacity = soc.housing.reduce((a, h) => a + h.capacity, 0);
  const vacant = soc.housing.reduce((a, h) => a + h.vacant, 0);
  return (
    <div className="tiles">
      <div className="tile"><div className="tile-label">Households</div><div className="tile-value">{fmt(households)}</div>
        <div className="tile-note">{(s.population / Math.max(1, households)).toFixed(2)} people on average</div></div>
      <div className="tile"><div className="tile-label">Housing capacity</div><div className="tile-value">{fmt(capacity)}</div>
        <div className="tile-note">{fmt(soc.housing.reduce((a, h) => a + h.buildings, 0))} buildings</div></div>
      <div className="tile"><div className="tile-label">Vacant dwellings</div><div className="tile-value">{fmt(vacant)}</div>
        <div className="tile-note">{pct(capacity ? vacant / capacity : 0)} of capacity</div></div>
      <div className={`tile ${soc.overcrowdedHouseholds ? 'tile-bad' : 'tile-good'}`}><div className="tile-label">Overcrowded households</div>
        <div className="tile-value">{fmt(soc.overcrowdedHouseholds)}</div><div className="tile-note">without a free dwelling</div></div>
    </div>
  );
}

function Households({ s, q }: { s: SettlementSimState; q: string }) {
  const rows = s.society.households.filter((g) => !q || g.label.toLowerCase().includes(q));
  const max = Math.max(...s.society.households.map((g) => g.households), 1);
  if (!rows.length) return <Empty>No household type matches “{q}”.</Empty>;
  return (
    <table className="grid" aria-label="Household composition">
      <thead><tr><th>Household type</th><th>Households</th><th className="num">People</th><th className="num">Avg size</th>
        <th className="num">Adults</th><th className="num">Children</th><th className="num">Elders</th></tr></thead>
      <tbody>
        {rows.map((g) => {
          const people = g.adults + g.children + g.elders;
          return (
            <tr key={g.kind}>
              <td>{g.label}</td>
              <td><ShareBar value={g.households} max={max} label={fmt(g.households)} /></td>
              <td className="num">{fmt(people)}</td><td className="num">{(people / g.households).toFixed(1)}</td>
              <td className="num">{fmt(g.adults)}</td><td className="num">{fmt(g.children)}</td><td className="num">{fmt(g.elders)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Housing({ s, q }: { s: SettlementSimState; q: string }) {
  const rows = s.society.housing.filter((h) => !q || h.label.toLowerCase().includes(q));
  if (!rows.length) return <Empty>No building type matches “{q}”.</Empty>;
  return (
    <table className="grid" aria-label="Housing stock">
      <thead><tr><th>Building type</th><th className="num">Buildings</th><th className="num">Dwellings</th><th>Occupancy</th>
        <th className="num">Vacant</th></tr></thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.type}>
            <td>{h.label}</td><td className="num">{fmt(h.buildings)}</td><td className="num">{fmt(h.capacity)}</td>
            <td><ShareBar value={h.occupied} max={h.capacity} label={`${fmt(h.occupied)} · ${pct(h.capacity ? h.occupied / h.capacity : 0)}`} /></td>
            <td className="num">{fmt(h.vacant)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Comparison({ settlements, onPick }: { settlements: SettlementSimState[]; onPick: (id: string) => void }) {
  return (
    <table className="grid" aria-label="Settlement housing comparison">
      <thead><tr><th>Settlement</th><th className="num">Population</th><th className="num">Households</th>
        <th className="num">Occupancy</th><th className="num">Overcrowded</th><th>Housing need</th></tr></thead>
      <tbody>
        {settlements.map((s) => {
          const soc = s.society;
          const capacity = soc.housing.reduce((a, h) => a + h.capacity, 0);
          const occupied = soc.housing.reduce((a, h) => a + h.occupied, 0);
          const need = soc.needs.find((n) => n.id === 'housing');
          return (
            <tr key={s.settlementId} onClick={() => onPick(s.settlementId)}>
              <td>{s.name}</td><td className="num">{fmt(s.population)}</td>
              <td className="num">{fmt(soc.households.reduce((a, g) => a + g.households, 0))}</td>
              <td className="num">{pct(capacity ? occupied / capacity : 0)}</td>
              <td className="num">{fmt(soc.overcrowdedHouseholds)}</td>
              <td>{need && <span className={`status status-${need.status}`}>{need.status}</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Households & Buildings: who lives where, and whether the housing stock still fits them. */
export function HouseholdsWorkspace({ sim, onSelect }: { sim: Simulation; onSelect: (id: string) => void }) {
  const state = useScenarioState(sim);
  const [picked, setPicked] = useState('');
  const [query, setQuery] = useState('');
  if (!sim.active) return <Empty>Create a scenario in the Simulation workspace first.</Empty>;
  return (
    <ApiView result={state} loadingLabel="Loading households…">
      {(st) => {
        const s = st.settlements.find((x) => x.settlementId === picked) ?? st.settlements[0];
        const q = query.trim().toLowerCase();
        return (
          <>
            <section className="section">
              <div className="section-head">
                <h2>Households &amp; buildings</h2>
                <span className="muted">{sim.active!.name} · {st.date.label}</span>
                <span className="appbar-spacer" />
                <SettlementPicker settlements={st.settlements} value={s.settlementId} onChange={setPicked} />
                <input className="search-inline" type="search" placeholder="Filter types…" aria-label="Filter household and building types"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="button" className="btn btn-compact" onClick={() => onSelect(s.settlementId)}>Inspect {s.name}</button>
              </div>
              <Overview s={s} />
              <h4>Needs</h4>
              <NeedsPanel needs={s.society.needs} />
            </section>
            <section className="section"><div className="section-head"><h2>Household composition</h2></div><Households s={s} q={q} /></section>
            <section className="section"><div className="section-head"><h2>Housing stock</h2>
              <span className="muted">built at baseline; no construction yet</span></div><Housing s={s} q={q} /></section>
            <section className="section"><div className="section-head"><h2>Across the scenario</h2></div>
              <Comparison settlements={st.settlements} onPick={setPicked} /></section>
          </>
        );
      }}
    </ApiView>
  );
}
