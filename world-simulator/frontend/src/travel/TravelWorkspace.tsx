import { useState } from 'react';
import { useApi } from '../api/worldApi';
import { fmt } from '../components/format';
import { ApiView, Empty } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import { TravelMap } from './TravelMap';
import { label, type TravelData } from './types';

export function TravelWorkspace({ sim, selectedId, onSelect }: {
  sim: Simulation; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const result = useApi<TravelData>(sim.active ?
    `/api/scenarios/${encodeURIComponent(sim.active.id)}/travel?v=${encodeURIComponent(sim.version)}` : null);
  const [includeHistory, setIncludeHistory] = useState(false);
  if (!sim.active) return <Empty>Select a scenario to inspect travel.</Empty>;
  return <ApiView result={result}>{(data) => <div className="travel-workspace">
    <TravelMap data={data} selectedId={selectedId} onSelect={onSelect} />
    <section className="section">
      <div className="section-head"><h2>Migration</h2><span>{fmt(data.populationInTransit)} people in transit</span>
        <label className="toggle"><input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} />
          Recent arrivals and returns</label>
      </div>
      <div className="grid-wrap"><table className="grid">
        <thead><tr><th>Journey</th><th>Status</th><th>People</th><th>Arrival</th></tr></thead>
        <tbody>{data.journeys.filter((j) => j.active || includeHistory).toReversed().map((j) => <tr key={j.id}>
          <td><button type="button" className="link" onClick={() => onSelect(j.id)}>{j.origin} → {j.destination}</button></td>
          <td>{label(j.status)}</td><td>{fmt(j.population)}</td><td>{j.arrival}</td>
        </tr>)}</tbody>
      </table></div>
      {!data.journeys.some((j) => j.active || includeHistory) && <Empty>No recorded journeys match this view.</Empty>}
      {data.flows.length > 0 && <div className="grid-wrap"><table className="grid">
        <caption>Recent population flows</caption>
        <thead><tr><th>From → To</th><th>In transit</th><th>Arrived</th><th>Returned</th></tr></thead>
        <tbody>{data.flows.map((flow) => <tr key={`${flow.originId}:${flow.destinationId}`}>
          <td>{flow.origin} → {flow.destination}</td><td>{fmt(flow.traveling)}</td><td>{fmt(flow.arrived)}</td><td>{fmt(flow.returned)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <section className="section">
      <div className="section-head"><h2>Caravans</h2></div>
      <div className="grid-wrap"><table className="grid">
        <thead><tr><th>Route</th><th>Caravan master</th><th>Status</th><th>Expected arrival</th></tr></thead>
        <tbody>{data.caravans.map((c) => <tr key={c.id}>
          <td><button type="button" className="link" onClick={() => onSelect(c.id)}>{c.fromName} → {c.toName}</button></td>
          <td>{c.carrier ?? c.traderName ?? 'Unassigned'}{c.repositioning && <span className="muted"> · Repositioning</span>}</td><td>{label(c.status)}</td><td>{c.arrival}</td>
        </tr>)}</tbody>
      </table></div>
      {!data.caravans.length && <Empty>No booked or traveling caravans.</Empty>}
    </section>
    {data.routes.length > 0 && <section className="section">
      <div className="section-head"><h2>Route index</h2></div>
      <ul className="trip-list">{data.routes.map((r) => <li key={r.id}>
        <button type="button" className="link" onClick={() => onSelect(r.id)}>{data.names[r.fromId]} ↔ {data.names[r.toId]}</button>
        {' · '}{label(r.mode)} · {r.days} days{r.id.startsWith('route:') && ' · Trade'}
      </li>)}</ul>
    </section>}
  </div>}</ApiView>;
}
