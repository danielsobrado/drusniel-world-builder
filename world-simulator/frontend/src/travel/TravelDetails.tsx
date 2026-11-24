import { useApi } from '../api/worldApi';
import { ApiView } from '../components/StateViews';
import { fmt } from '../components/format';
import type { Simulation } from '../simulation/useSimulation';
import { label, type Journey, type TravelDetail, type TravelPath } from './types';

type Select = (id: string) => void;

function RouteFacts({ route, names }: { route: TravelPath; names: Record<string, string> }) {
  return <dl className="fields">
    <div className="field"><dt>Route</dt><dd>{names[route.fromId]} ↔ {names[route.toId]}</dd></div>
    <div className="field"><dt>Mode</dt><dd>{label(route.mode)}</dd></div>
    <div className="field"><dt>Distance</dt><dd>{fmt(route.distance)} {route.unit}</dd></div>
    <div className="field"><dt>Typical duration</dt><dd>{route.days} days</dd></div>
    {route.sourceRouteIds.length > 0 && <div className="field"><dt>Azgaar routes</dt><dd>{route.sourceRouteIds.join(', ')}</dd></div>}
  </dl>;
}

export function JourneyDetails({ item, onSelect }: { item: Journey; onSelect: Select }) {
  return <>
    <h3>{item.origin} → {item.destination}</h3>
    <dl className="fields">
      <div className="field"><dt>Status</dt><dd>{label(item.status)}</dd></div>
      {['returning', 'returned'].includes(item.status) && <div className="field"><dt>Return to</dt><dd>{item.origin}</dd></div>}
      <div className="field"><dt>Reason</dt><dd>{label(item.reason)}</dd></div>
      <div className="field"><dt>Departed</dt><dd>{item.departure}</dd></div>
      <div className="field"><dt>{item.active ? 'Expected arrival' : 'Arrival'}</dt><dd>{item.arrival}</dd></div>
      <div className="field"><dt>Travelers</dt><dd>{fmt(item.population)}</dd></div>
    </dl>
    {item.companions.length > 0 && <>
      <h4>Named companions</h4>
      <ul className="trip-list">{item.companions.map((p) => <li key={p.id}>
        <button type="button" className="link" onClick={() => onSelect(p.id)}>{p.name}</button>
      </li>)}</ul>
    </>}
    {item.incidents.length > 0 && <>
      <h4>Incidents</h4>
      <ul className="trip-list">{item.incidents.map((i) => <li key={`${i.day}:${i.kind}`}>
        {label(i.kind)} · {i.date}{i.delayDays > 0 && ` · ${i.delayDays} days`}
      </li>)}</ul>
    </>}
    {item.news.length > 0 && <dl className="fields">
      <div className="field"><dt>Reports carried</dt><dd>{item.news.length}</dd></div>
    </dl>}
  </>;
}

export function TravelDetails({ id, sim, onSelect }: { id: string; sim: Simulation; onSelect: Select }) {
  const result = useApi<TravelDetail>(sim.active ? `/api/scenarios/${encodeURIComponent(sim.active.id)}/travel/${encodeURIComponent(id)}?v=${encodeURIComponent(sim.version)}` : null);
  return <ApiView result={result}>{(detail) => <div className="details">
    {detail.kind === 'journeys' && <JourneyDetails item={detail.item} onSelect={onSelect} />}
    {detail.kind === 'caravans' && (() => {
      const c = detail.item;
      return <>
        <h3>{c.fromName} → {c.toName}</h3>
        <dl className="fields">
          <div className="field"><dt>Status</dt><dd>{label(c.status)}</dd></div>
          <div className="field"><dt>Departure</dt><dd>{c.departure}</dd></div>
          <div className="field"><dt>{c.status === 'arrived' ? 'Arrived' : 'Expected arrival'}</dt><dd>{c.arrival}</dd></div>
          {c.carrierId && <div className="field"><dt>Caravan master</dt><dd>
            <button type="button" className="link" onClick={() => onSelect(c.carrierId!)}>{c.carrier ?? c.traderName}</button>
          </dd></div>}
          {c.delayReason && <div className="field"><dt>Delay</dt><dd>{label(c.delayReason)} · {c.delayDays} days</dd></div>}
          {Object.keys(c.lost).length > 0 && <div className="field"><dt>Lost cargo</dt>
            <dd>{Object.entries(c.lost).map(([good, quantity]) => `${fmt(quantity)} ${good}`).join(' · ')}</dd></div>}
          <div className="field"><dt>Reports carried</dt><dd>{c.news.length}</dd></div>
        </dl>
      </>;
    })()}
    {detail.kind === 'routes' && <RouteFacts route={detail.item} names={detail.names} />}
    {detail.route && <>
      <h4>Intended route</h4>
      <RouteFacts route={detail.route} names={detail.names} />
    </>}
  </div>}</ApiView>;
}
