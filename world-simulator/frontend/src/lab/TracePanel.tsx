import { useState } from 'react';
import { useApi } from '../api/worldApi';
import { ApiView } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import type { Trace } from './types';

/** Causes back and consequences forward from one event, by steps away from it. */
export function TracePanel({ sim, eventId, onEvent, onSelect }: {
  sim: Simulation; eventId: string | null; onEvent: (id: string) => void; onSelect: (id: string) => void;
}) {
  const active = sim.active!;
  const [typed, setTyped] = useState('');
  const result = useApi<Trace>(eventId ? `/api/scenarios/${encodeURIComponent(active.id)}/history/events/${encodeURIComponent(eventId)}/trace?depth=5&v=${sim.version}` : null);
  return (
    <>
      <form className="lab-form compare-form trace-form" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) onEvent(typed.trim().startsWith('event:') ? typed.trim() : `event:${typed.trim()}`); }}>
        <label className="field"><span>Event</span><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={eventId ?? 'event:1234'} aria-label="Event to trace" /></label>
        <button type="submit" className="btn">Trace</button>
      </form>
      {!eventId && <p className="muted small">Apply an intervention, or enter an event id, to follow what led to it and what it led to.</p>}
      {eventId && (
        <ApiView result={result} loadingLabel="Following causes…">
          {(t) => {
            const depths = [...new Set(t.nodes.map((n) => n.depth))].sort((a, b) => a - b);
            return (
              <ol className="trace" aria-label="Causal trace">
                {depths.map((d) => (
                  <li key={d} className={d === 0 ? 'trace-root' : ''}>
                    <span className="trace-step">{d < 0 ? `${-d} back` : d === 0 ? 'this event' : `${d} on`}</span>
                    <ul>{t.nodes.filter((n) => n.depth === d).map((n) => (
                      <li key={n.id}>
                        <button type="button" className="linklike" onClick={() => onEvent(n.id)} title="Trace from here">{n.summary}</button>
                        <span className="muted small"> {n.date} · {n.kind}{n.source !== 'simulation' ? ` · ${n.source}` : ''}</span>
                        {n.participants[0] && <> · <button type="button" className="linklike small" onClick={() => onSelect(n.participants[0].personId)}>{n.participants[0].name}</button></>}
                      </li>))}</ul>
                  </li>
                ))}
              </ol>
            );
          }}
        </ApiView>
      )}
    </>
  );
}
