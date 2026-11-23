import { useEffect, useState } from 'react';
import type { Business, PageMeta, ScenarioState, SettlementSimState } from '../api/types';
import { useApi } from '../api/worldApi';
import { fmt, pct } from '../components/format';
import { ApiView, Empty, ErrorState, Loading } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import { SettlementPicker, ShareBar, useScenarioState } from './SocietyParts';
import { DiagnosticsTable } from './DiagnosticsTable';
import { IdleTable, UnemploymentTrend } from './UnemploymentView';

const SECTORS = ['agriculture', 'extraction', 'crafts', 'trade', 'services', 'security'];

function sum<T>(items: T[], pick: (t: T) => number) {
  return items.reduce((a, t) => a + pick(t), 0);
}

function EmploymentTiles({ settlements }: { settlements: SettlementSimState[] }) {
  const e = settlements.map((s) => s.society.employment);
  const supply = sum(e, (x) => x.labourSupply);
  const employed = sum(e, (x) => x.employed);
  return (
    <div className="tiles">
      <div className="tile"><div className="tile-label">Labour force</div><div className="tile-value">{fmt(supply)}</div>
        <div className="tile-note">working-age adults and active elders</div></div>
      <div className="tile"><div className="tile-label">Employed</div><div className="tile-value">{fmt(employed)}</div>
        <div className="tile-note">{pct(supply ? employed / supply : 0)} of the labour force</div></div>
      <div className="tile"><div className="tile-label">Without work</div><div className="tile-value">{fmt(sum(e, (x) => x.unemployed))}</div></div>
      <div className="tile"><div className="tile-label">Unfilled posts</div><div className="tile-value">{fmt(sum(e, (x) => x.vacancies))}</div></div>
      <div className="tile"><div className="tile-label">Wage bill / month</div><div className="tile-value">{fmt(sum(e, (x) => x.wageBillPerMonth))}</div>
        <div className="tile-note">copper</div></div>
    </div>
  );
}

function Sectors({ settlements }: { settlements: SettlementSimState[] }) {
  const rows = SECTORS.map((sector) => {
    const all = settlements.flatMap((s) => s.society.sectors.filter((x) => x.sector === sector));
    return { sector, businesses: sum(all, (x) => x.businesses), demand: sum(all, (x) => x.demand), filled: sum(all, (x) => x.filled) };
  }).filter((r) => r.businesses > 0);
  const max = Math.max(...rows.map((r) => r.demand), 1);
  return (
    <table className="grid" aria-label="Labour by sector">
      <thead><tr><th>Sector</th><th className="num">Businesses</th><th>Posts filled</th><th className="num">Unfilled</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.sector}>
          <td className="cap">{r.sector}</td><td className="num">{fmt(r.businesses)}</td>
          <td><ShareBar value={r.filled} max={max} label={`${fmt(r.filled)} of ${fmt(r.demand)}`} /></td>
          <td className="num">{fmt(r.demand - r.filled)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function Professions({ settlements }: { settlements: SettlementSimState[] }) {
  const by = new Map<string, { posts: number; filled: number }>();
  for (const p of settlements.flatMap((s) => s.businessSummary?.professions ?? [])) {
    const row = by.get(p.profession) ?? { posts: 0, filled: 0 };
    row.posts += p.posts;
    row.filled += p.filled;
    by.set(p.profession, row);
  }
  const rows = [...by.entries()].sort((a, b) => b[1].filled - a[1].filled || a[0].localeCompare(b[0]));
  const max = Math.max(...rows.map(([, r]) => r.posts), 1);
  return (
    <table className="grid" aria-label="Workers by profession">
      <thead><tr><th>Profession</th><th>Workers</th></tr></thead>
      <tbody>{rows.map(([name, r]) => (
        <tr key={name}><td className="cap">{name}</td><td><ShareBar value={r.filled} max={max} label={`${fmt(r.filled)} / ${fmt(r.posts)}`} /></td></tr>
      ))}</tbody>
    </table>
  );
}

function BusinessTable({ sim, settlement, onSelect, selectedId }: {
  sim: Simulation; settlement: string; onSelect: (id: string) => void; selectedId: string | null;
}) {
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, sector, settlement]);
  const params = new URLSearchParams({ page: String(page), pageSize: '50', v: sim.version });
  if (settlement) params.set('settlement', settlement);
  if (sector) params.set('sector', sector);
  if (q.trim()) params.set('q', q.trim());
  const list = useApi<Business[], PageMeta>(`/api/scenarios/${encodeURIComponent(sim.active!.id)}/businesses?${params}`);
  const info = list.meta?.page;
  return (
    <>
      <div className="inline-form">
        <input type="search" placeholder="Search name, profession or good…" aria-label="Search businesses" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">All sectors</option>{SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0
        ? <Empty>No business matches.</Empty> : (
          <table className="grid" aria-label="Businesses">
            <thead><tr><th>Business</th><th>Sector</th><th>Profession</th><th className="num">Staff</th><th className="num">Wage</th><th>Source</th></tr></thead>
            <tbody>{list.data.map((b) => (
              <tr key={b.id} className={b.id === selectedId ? 'selected' : undefined} onClick={() => onSelect(b.id)} tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(b.id); }}>
                <td>{b.name}</td><td className="cap">{b.sector}</td><td className="cap">{b.profession}</td>
                <td className={`num ${b.filled < b.staff ? 'warn-ink' : ''}`}>{b.filled} / {b.staff}</td>
                <td className="num">{b.wage}</td>
                <td className="muted small">{b.evidence ?? (b.openedDay != null ? `opened day ${b.openedDay}${b.ownerId ? ' by a trader' : ' by the town'}` : 'generic')}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      {info && info.totalPages > 1 && (
        <div className="pager">
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {info.page} of {info.totalPages} · {fmt(info.totalItems)} businesses</span>
          <button type="button" className="btn" disabled={page >= info.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}

/** Businesses & Employment: where people work, and where labour runs short or idle. */
export function BusinessesWorkspace({ sim, onSelect, selectedId }: { sim: Simulation; onSelect: (id: string) => void; selectedId: string | null }) {
  const state = useScenarioState(sim);
  const [settlement, setSettlement] = useState('');
  if (!sim.active) return <Empty>Create a scenario in the Simulation workspace first.</Empty>;
  return (
    <ApiView result={state} loadingLabel="Loading employment…">
      {(st: ScenarioState) => {
        const chosen = st.settlements.filter((s) => !settlement || s.settlementId === settlement);
        return (
          <>
            <section className="section">
              <div className="section-head">
                <h2>Businesses &amp; employment</h2>
                <span className="muted">{sim.active!.name} · {st.date.label}</span>
                <span className="appbar-spacer" />
                <SettlementPicker settlements={st.settlements} value={settlement} onChange={setSettlement} allowAll />
              </div>
              <EmploymentTiles settlements={chosen} />
            </section>
            <section className="section">
              <div className="section-head"><h2>Unemployment</h2>
                <span className="muted">towns open businesses once 40 are idle; the rest can take to the roads</span></div>
              <UnemploymentTrend state={st} />
              <h4>Where the idle go</h4>
              <IdleTable state={st} />
            </section>
            <div className="split">
              <section className="section"><div className="section-head"><h2>Labour by sector</h2>
                <span className="muted">filled in priority order when labour is short</span></div><Sectors settlements={chosen} /></section>
              <section className="section"><div className="section-head"><h2>Professions</h2></div><Professions settlements={chosen} /></section>
            </div>
            <section className="section">
              <div className="section-head"><h2>Plausibility</h2>
                <span className="muted">enterprises against people and buildings; several may share one building</span></div>
              <DiagnosticsTable sim={sim} />
            </section>
            <section className="section">
              <div className="section-head"><h2>Businesses</h2><span className="muted">workshops and mines exist only where Azgaar records the good</span></div>
              <BusinessTable sim={sim} settlement={settlement} onSelect={onSelect} selectedId={selectedId} />
            </section>
          </>
        );
      }}
    </ApiView>
  );
}
