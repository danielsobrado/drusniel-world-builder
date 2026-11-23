import { useState } from 'react';
import type { HistoryEventView } from '../api/types';
import { Empty } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import { ChecksPanel } from './ChecksPanel';
import { ComparePanel } from './ComparePanel';
import { InterventionPanel } from './InterventionPanel';
import { MetricsPanel } from './MetricsPanel';
import { TracePanel } from './TracePanel';

/** Validation Lab: inject events, then check the scenario replays, stays consistent and differs where it should. */
export function LabWorkspace({ sim, onSelect }: { sim: Simulation; onSelect: (id: string) => void }) {
  const [recorded, setRecorded] = useState<HistoryEventView[]>([]);
  const [traceId, setTraceId] = useState<string | null>(null);
  if (!sim.active) return <Empty>Create a scenario in the Simulation workspace first.</Empty>;
  const onRecorded = (events: HistoryEventView[]) => { setRecorded(events); setTraceId(events[0].id); };
  return (
    <>
      <div className="split">
        <section className="section" aria-label="Interventions">
          <div className="section-head"><h2>Intervene</h2><span className="muted">{sim.active.name} · {sim.active.date.label}</span></div>
          <InterventionPanel sim={sim} onRecorded={onRecorded} />
          {recorded.length > 0 && (
            <div className="recorded" role="status">
              <strong>{recorded[0].summary}</strong>
              <span className="muted small"> · {recorded[0].id} · {recorded.length - 1 ? `${recorded.length - 1} people lost work with it on record` : 'no one lost work'}</span>
            </div>
          )}
        </section>
        <section className="section" aria-label="Replay and consistency">
          <div className="section-head"><h2>Replay and consistency</h2></div>
          <ChecksPanel sim={sim} />
        </section>
      </div>
      <section className="section" aria-label="Causal trace">
        <div className="section-head"><h2>Causal trace</h2><span className="muted">only links the simulation itself established</span></div>
        <TracePanel sim={sim} eventId={traceId} onEvent={setTraceId} onSelect={onSelect} />
      </section>
      <section className="section" aria-label="Comparison">
        <div className="section-head"><h2>Compare</h2><span className="muted">two scenarios, or a scenario and a snapshot</span></div>
        <ComparePanel sim={sim} />
      </section>
      <section className="section" aria-label="Performance">
        <div className="section-head"><h2>Performance</h2></div>
        <MetricsPanel sim={sim} />
      </section>
    </>
  );
}
