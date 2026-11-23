import { useEffect, useMemo, useState } from 'react';
import type { SnapshotMeta } from '../api/types';
import { getJson, useApi } from '../api/worldApi';
import { fmt } from '../components/format';
import { ApiView } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import type { Comparison, Pair } from './types';

const MEASURES: Record<string, string> = {
  population: 'Population', employed: 'Employed', unemployed: 'Without work', businesses: 'Businesses', foodSecurity: 'Food security',
  treasury: 'Treasury', tradeBalance: 'Trade balance', shortages: 'Shortages',
};

function Delta({ p, digits = 0 }: { p: Pair; digits?: number }) {
  if (p.delta === null || p.delta === 0) return <span className="muted">–</span>;
  const n = digits ? p.delta.toFixed(digits) : fmt(Math.round(p.delta));
  return <span className={p.delta > 0 ? 'delta-up' : 'delta-down'}>{p.delta > 0 ? '+' : ''}{n}</span>;
}

const show = (v: number | null, digits = 0) => (v === null ? '–' : digits ? v.toFixed(digits) : fmt(Math.round(v)));

interface Ref { scenarioId: string; snapshotId: string | null; label: string }

function useRefs(sim: Simulation): Ref[] {
  const [snaps, setSnaps] = useState<Record<string, SnapshotMeta[]>>({});
  const ids = sim.scenarios.map((s) => `${s.id}:${s.snapshots}`).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(sim.scenarios.map(async (s) => [s.id, (await getJson<SnapshotMeta[]>(`/api/scenarios/${encodeURIComponent(s.id)}/snapshots`)).data] as const))
      .then((rows) => { if (live) setSnaps(Object.fromEntries(rows)); }).catch(() => { /* listed without snapshots */ });
    return () => { live = false; };
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps -- refetch when scenarios or their snapshot counts change
  return useMemo(() => sim.scenarios.flatMap((s) => [
    { scenarioId: s.id, snapshotId: null, label: `${s.name} · now (${s.date.label})` },
    ...(snaps[s.id] ?? []).map((x) => ({ scenarioId: s.id, snapshotId: x.id, label: `${s.name} · snapshot “${x.label}” (${x.date.label})` })),
  ]), [sim.scenarios, snaps]);
}

const key = (r: { scenarioId: string; snapshotId: string | null }) => `${r.scenarioId}|${r.snapshotId ?? ''}`;

function Results({ c }: { c: Comparison }) {
  return (
    <>
      <p className="small">{c.dates.same ? `Both at ${c.dates.a}.` : <span className="status status-strained">A is at {c.dates.a}, B at {c.dates.b}: differences include the time between.</span>}{' '}
        They share the first {fmt(c.history.shared)} events; after that A recorded {fmt(c.history.afterA)} and B {fmt(c.history.afterB)}.</p>
      <div className="table-scroll">
        <table className="grid" aria-label="Settlements compared">
          <thead><tr><th>Settlement</th>{Object.values(MEASURES).map((m) => <th key={m} className="num">{m}</th>)}</tr></thead>
          <tbody>{c.settlements.map((s) => (
            <tr key={s.settlementId}><td>{s.name}</td>
              {Object.keys(MEASURES).map((k) => {
                const digits = k === 'foodSecurity' ? 2 : 0;
                return <td key={k} className="num">{show(s.measures[k].b, digits)} <Delta p={s.measures[k]} digits={digits} /></td>;
              })}</tr>
          ))}</tbody>
        </table>
      </div>
      <p className="muted small">Each cell shows B, then its difference from A.</p>
      {c.settlements.some((s) => s.production.length > 0) && (
        <><h4>Production that differs (last month)</h4>
          <ul className="trip-list">{c.settlements.flatMap((s) => s.production.map((p) => (
            <li key={`${s.settlementId}:${p.good}`}>{s.name}: {p.good} {show(p.a, 2)} → {show(p.b, 2)} <Delta p={p} digits={2} /></li>)))}</ul></>
      )}
      {c.routes.some((r) => r.bandits.delta) && (
        <><h4>Outlaws on the routes</h4>
          <ul className="trip-list">{c.routes.filter((r) => r.bandits.delta).map((r) => (
            <li key={r.routeId}>{r.name}: {show(r.bandits.a)} → {show(r.bandits.b)} <Delta p={r.bandits} /></li>))}</ul></>
      )}
      <h4>Named people whose lives went differently ({fmt(c.people.changedCount)} of {fmt(c.people.compared)})</h4>
      <p className="muted small">{Object.entries(c.people.changedBy).map(([k, n]) => `${k}: ${n}`).join(' · ') || 'None.'}
        {c.people.onlyB ? ` · ${c.people.onlyB} only in B (born or arrived there)` : ''}{c.people.onlyA ? ` · ${c.people.onlyA} only in A` : ''}</p>
      {c.people.changed.length > 0 && (
        <div className="table-scroll short">
          <table className="grid" aria-label="People compared">
            <thead><tr><th>Person</th><th>In A</th><th>In B</th></tr></thead>
            <tbody>{c.people.changed.map((p) => (
              <tr key={p.personId}><td>{p.name}</td>
                <td className="small">{p.a.alive ? p.a.role : 'dead'}{p.a.workplace ? ` at ${p.a.workplace}` : ''} · {p.a.settlement}</td>
                <td className="small">{p.b.alive ? p.b.role : 'dead'}{p.b.workplace ? ` at ${p.b.workplace}` : ''} · {p.b.settlement}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <h4>What each recorded after they diverged</h4>
      <div className="split">
        {(['A', 'B'] as const).map((side) => (
          <div key={side}><h5>{side}: {side === 'A' ? c.a.name : c.b.name}</h5>
            <ul className="trip-list" aria-label={`Notable events in ${side}`}>
              {(side === 'A' ? c.history.notableA : c.history.notableB).map((e) => (
                <li key={e.id}><span className="muted small">{e.date}</span> {e.summary}{e.source === 'intervention' && <span className="chip chip-muted">intervention</span>}</li>))}
              {(side === 'A' ? c.history.notableA : c.history.notableB).length === 0 && <li className="muted">Nothing notable.</li>}
            </ul></div>
        ))}
      </div>
      <p className="muted small">By kind: {c.history.kinds.slice(0, 12).map((k) => `${k.kind} ${show(k.a)}→${show(k.b)}`).join(' · ')}</p>
    </>
  );
}

/** Two scenarios, or a scenario and one of its snapshots, side by side. */
export function ComparePanel({ sim }: { sim: Simulation }) {
  const refs = useRefs(sim);
  const active = sim.active!;
  // A branch compares with its parent now; otherwise the scenario now with its latest snapshot.
  const latest = refs.filter((r) => r.scenarioId === active.id && r.snapshotId)
    .sort((x, y) => (y.snapshotId ?? '').localeCompare(x.snapshotId ?? ''))[0];       // snap-NNN: the highest is the newest
  const fallbackA = active.parent ? `${active.parent.scenarioId}|` : latest ? key(latest) : `${active.id}|`;
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const pickA = a ?? fallbackA;
  const pickB = b ?? `${active.id}|`;
  const [ra, rb] = [pickA, pickB].map((k) => k.split('|'));
  const url = asked ? `/api/compare?${new URLSearchParams({ a: ra[0], b: rb[0], ...(ra[1] ? { aSnapshot: ra[1] } : {}), ...(rb[1] ? { bSnapshot: rb[1] } : {}) })}&v=${asked}` : null;
  const result = useApi<Comparison>(url);
  return (
    <>
      <div className="lab-form compare-form">
        <label className="field"><span>A</span><select aria-label="Compare A" value={pickA} onChange={(e) => setA(e.target.value)}>
          {refs.map((r) => <option key={key(r)} value={key(r)}>{r.label}</option>)}</select></label>
        <label className="field"><span>B</span><select aria-label="Compare B" value={pickB} onChange={(e) => setB(e.target.value)}>
          {refs.map((r) => <option key={key(r)} value={key(r)}>{r.label}</option>)}</select></label>
        <button type="button" className="btn" onClick={() => setAsked(`${pickA}>${pickB}:${sim.version}`)}>Compare</button>
      </div>
      {asked && <ApiView result={result} loadingLabel="Comparing…">{(c) => <Results c={c} />}</ApiView>}
    </>
  );
}
