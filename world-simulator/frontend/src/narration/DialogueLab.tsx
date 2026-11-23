import { useState } from 'react';
import type { BiographyContext, PersonRow } from '../api/types';
import { useApi } from '../api/worldApi';
import { ApiView, Empty } from '../components/StateViews';
import { ROLE_LABEL } from '../people/roles';
import type { Simulation } from '../simulation/useSimulation';
import { ChatPanel } from './ChatPanel';
import type { LlmStatus } from './useLlm';

function Briefing({ scenarioId, personId }: { scenarioId: string; personId: string }) {
  const result = useApi<BiographyContext>(`/api/scenarios/${encodeURIComponent(scenarioId)}/people/${encodeURIComponent(personId)}/context`);
  return (
    <ApiView result={result} loadingLabel="Reading their record…">
      {(c) => (
        <div className="briefing">
          <h4>What they may talk about</h4>
          <ul className="trip-list">{c.hooks.map((h) => <li key={h.text}>{h.text}</li>)}
            {c.hooks.length === 0 && <li className="muted">Nothing pressing; {c.outlook.mood}.</li>}</ul>
          <h4>What they would pass on</h4>
          <ul className="trip-list">{c.knowledge.filter((k) => k.wouldTell).map((k) => <li key={k.event}>{k.event} <span className="muted small">({k.how})</span></li>)}
            {!c.knowledge.some((k) => k.wouldTell) && <li className="muted">Only what everyone in {c.identity.home} knows.</li>}</ul>
          {c.knowledge.some((k) => !k.wouldTell) && <p className="muted small">They also know {c.knowledge.filter((k) => !k.wouldTell).length} thing(s) they keep to themselves.</p>}
          <h4>Manner</h4>
          <p className="small">{String(c.personality.temperament)} · values {Array.isArray(c.personality.values) ? c.personality.values.join(', ') : ''} · {c.outlook.mood}</p>
        </div>
      )}
    </ApiView>
  );
}

/** Dialogue Lab: pick a named person and talk with them; they speak from their own record only. */
export function DialogueLab({ sim, llm }: { sim: Simulation; llm: LlmStatus | null }) {
  const [q, setQ] = useState('');
  const [person, setPerson] = useState<PersonRow | null>(null);
  const active = sim.active;
  const params = new URLSearchParams({ pageSize: '12', v: sim.version });
  if (q.trim()) params.set('q', q.trim());
  const found = useApi<PersonRow[]>(active ? `/api/scenarios/${encodeURIComponent(active.id)}/people?${params}` : null);
  if (!active) return <Empty>Create a scenario in the Simulation workspace first.</Empty>;
  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Dialogue Lab</h2>
          <span className="muted">{llm?.mode === 'llm' ? `speaking through ${llm.model}` : 'draft writer: canned answers from the record, no model'}</span></div>
        {llm?.hint && <p className="status status-strained small">{llm.hint}</p>}
        <div className="inline-form">
          <input type="search" aria-label="Find someone to talk to" placeholder="Find someone by name or trade…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ApiView result={found} loadingLabel="Finding people…">
          {(rows) => (
            <div className="people-picks" role="list" aria-label="People to talk to">
              {rows.map((p) => (
                <button key={p.id} type="button" role="listitem" className={`chip${person?.id === p.id ? '' : ' chip-muted'}`} onClick={() => setPerson(p)}>
                  {p.name} {p.family} · {ROLE_LABEL[p.role]} · {p.settlementName}
                </button>
              ))}
            </div>
          )}
        </ApiView>
      </section>
      {person ? (
        <div className="split">
          <section className="section"><div className="section-head"><h2>{person.name} {person.family}</h2></div>
            <ChatPanel key={person.id} scenarioId={active.id} personId={person.id} name={`${person.name} ${person.family}`} /></section>
          <section className="section"><Briefing scenarioId={active.id} personId={person.id} /></section>
        </div>
      ) : <section className="section"><p className="muted">Choose someone above to start talking.</p></section>}
    </>
  );
}
