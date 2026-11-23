import type { EventDetail, HistoryEventView } from '../api/types';
import { useApi } from '../api/worldApi';
import { ApiView } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';

function EventLinks({ events, onSelect, empty }: { events: HistoryEventView[]; onSelect: (id: string) => void; empty: string }) {
  if (!events.length) return <p className="muted small">{empty}</p>;
  return <ul className="trip-list">{events.map((e) => (
    <li key={e.id}><button type="button" className="link" onClick={() => onSelect(e.id)}>{e.date} · {e.summary}</button></li>
  ))}</ul>;
}

/** Inspector view of one canonical event: what happened, to whom, why, and what followed. */
export function EventDetails({ id, sim, onSelect }: { id: string; sim: Simulation; onSelect: (id: string) => void }) {
  const result = useApi<EventDetail>(`/api/scenarios/${encodeURIComponent(sim.active!.id)}/history/events/${encodeURIComponent(id)}?v=${sim.version}`);
  return (
    <ApiView result={result} loadingLabel="Loading event…">
      {(e) => (
        <div className="details">
          <div className="details-head"><h3>{e.summary}</h3><code className="muted">{e.id} · {e.kind}</code></div>
          <dl className="fields">
            <div className="field"><dt>When</dt><dd>{e.datePrecision === 'approximate' ? `about ${e.date}` : e.date} ({e.datePrecision})</dd></div>
            <div className="field"><dt>Origin</dt><dd>{e.source === 'generated-prehistory' ? 'reconstructed past, not observed' : e.source}</dd></div>
            <div className="field"><dt>Importance</dt><dd>{e.importance} of 5 · {e.category} · known to {e.visibility}</dd></div>
            {Object.keys(e.facts).length > 0 && <div className="field"><dt>Facts</dt><dd>{Object.entries(e.facts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</dd></div>}
            {e.effects.length > 0 && <div className="field"><dt>Effects</dt><dd>{e.effects.map((x) => `${x.kind} (${x.severity}) on ${x.entityId}`).join(' · ')}</dd></div>}
          </dl>
          <h4>Who</h4>
          {e.participants.length ? <ul className="trip-list">{e.participants.map((p) => (
            <li key={`${p.personId}-${p.role}`}><button type="button" className="link" onClick={() => onSelect(p.personId)}>{p.name}</button> · {p.role}</li>
          ))}</ul> : <p className="muted small">No named person took part.</p>}
          <h4>Caused by</h4>
          <EventLinks events={e.causes} onSelect={onSelect} empty="No cause the simulation established." />
          <h4>Led to</h4>
          <EventLinks events={e.consequences} onSelect={onSelect} empty="Nothing recorded as following from it." />
        </div>
      )}
    </ApiView>
  );
}
