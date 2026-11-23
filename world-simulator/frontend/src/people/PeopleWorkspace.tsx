import { useEffect, useState } from 'react';
import type { PeopleMeta, PersonRow } from '../api/types';
import { useApi } from '../api/worldApi';
import { fmt } from '../components/format';
import { Empty, ErrorState, Loading } from '../components/StateViews';
import { TraitBars } from '../roads/TraderParts';
import type { Simulation } from '../simulation/useSimulation';
import { occupation, ROLE_LABEL } from './roles';

function Tiles({ meta }: { meta: PeopleMeta }) {
  const alive = Object.values(meta.roles).reduce((a, n) => a + n, 0);
  return (
    <div className="tiles">
      <div className="tile"><div className="tile-label">Named people</div><div className="tile-value">{fmt(alive)}</div>
        <div className="tile-note">the NPC budget, kept whole: {meta.settlements.map((s) => `${s.name} ${s.budget}`).join(' · ')}</div></div>
      <div className="tile"><div className="tile-label">At work</div><div className="tile-value">{fmt((meta.roles.worker ?? 0) + (meta.roles.trader ?? 0))}</div>
        <div className="tile-note">{fmt(meta.roles.unemployed ?? 0)} without work · {fmt(meta.roles.retired ?? 0)} retired · {fmt(meta.roles.child ?? 0)} children</div></div>
      <div className={`tile ${(meta.roles.outlaw ?? 0) + (meta.roles.imprisoned ?? 0) ? 'tile-bad' : ''}`}><div className="tile-label">Outlaws</div>
        <div className="tile-value">{fmt(meta.roles.outlaw ?? 0)}</div><div className="tile-note">{fmt(meta.roles.imprisoned ?? 0)} in prison</div></div>
      <div className="tile"><div className="tile-label">Since the start</div><div className="tile-value">{fmt(meta.deaths)} died</div>
        <div className="tile-note">{fmt(meta.births)} born · {fmt(meta.arrivals)} came from elsewhere</div></div>
    </div>
  );
}

/** People: the named, persistent characters of the scenario, with their roles, work and personalities. */
export function PeopleWorkspace({ sim, onSelect, selectedId }: { sim: Simulation; onSelect: (id: string) => void; selectedId: string | null }) {
  const [settlement, setSettlement] = useState('');
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [alive, setAlive] = useState(true);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [settlement, role, q, alive]);
  const params = new URLSearchParams({ page: String(page), pageSize: '50', alive: String(alive), v: sim.version });
  if (settlement) params.set('settlement', settlement);
  if (role) params.set('role', role);
  if (q.trim()) params.set('q', q.trim());
  const list = useApi<PersonRow[], PeopleMeta>(sim.active ? `/api/scenarios/${encodeURIComponent(sim.active.id)}/people?${params}` : null);
  if (!sim.active) return <Empty>Create a scenario in the Simulation workspace first.</Empty>;
  const meta = list.meta;
  return (
    <>
      <section className="section">
        <div className="section-head"><h2>People</h2><span className="muted">{sim.active.name} · {sim.active.date.label}</span></div>
        {meta ? <Tiles meta={meta} /> : <Loading />}
      </section>
      <section className="section">
        <div className="inline-form">
          <select aria-label="Settlement" value={settlement} onChange={(e) => setSettlement(e.target.value)}>
            <option value="">All settlements</option>{meta?.settlements.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Every role</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="search" placeholder="Search name or trade…" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Living or departed" value={String(alive)} onChange={(e) => setAlive(e.target.value === 'true')}>
            <option value="true">Living</option><option value="false">Departed</option>
          </select>
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0
          ? <Empty>Nobody matches.</Empty> : (
            <div className="table-scroll">
              <table className="grid" aria-label="People">
                <thead><tr><th>Name</th><th className="num">Age</th><th>Settlement</th><th>Role</th><th>Work</th><th>Personality</th></tr></thead>
                <tbody>{list.data.map((p) => (
                  <tr key={p.id} className={p.id === selectedId ? 'selected' : undefined} onClick={() => onSelect(p.id)}>
                    <td>{p.name} {p.family}</td><td className="num">{p.age}</td><td>{p.settlementName}</td>
                    <td>{ROLE_LABEL[p.role]}{!p.alive && <span className="muted"> · died ({p.cause})</span>}</td>
                    <td className="muted">{occupation(p)}</td><td><TraitBars personality={p.personality} compact /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        {meta && meta.page.totalPages > 1 && (
          <div className="pager">
            <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {meta.page.page} of {meta.page.totalPages} · {fmt(meta.page.totalItems)} people</span>
            <button type="button" className="btn" disabled={page >= meta.page.totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </section>
    </>
  );
}
