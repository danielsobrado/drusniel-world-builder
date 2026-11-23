import { useState } from 'react';
import type { Simulation } from '../simulation/useSimulation';
import { ChatPanel } from '../narration/ChatPanel';
import { LifeTab } from './LifeTab';
import { BiographyTab, KnowledgeTab, OverviewTab, RelationshipsTab } from './ProfileTabs';

const TABS = ['Overview', 'Life', 'Relationships', 'Knowledge', 'Biography', 'Dialogue'] as const;

/** A character research profile: one person's record, their life, ties, knowledge and the facts a biography may use. */
export function Profile({ sim, personId, name, onSelect, selectedId }: {
  sim: Simulation; personId: string; name: string; onSelect: (id: string) => void; selectedId: string | null;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const base = `/api/scenarios/${encodeURIComponent(sim.active!.id)}/people/${encodeURIComponent(personId)}`;
  const versioned = `${base}`;
  return (
    <section className="section" aria-label={`Profile of ${name}`}>
      <div className="section-head"><h2>{name}</h2><span className="muted">{personId}</span></div>
      <div className="subtabs" role="tablist">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} className={`subtab${t === tab ? ' active' : ''}`}
          onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div key={`${personId}-${sim.version}`}>
        {tab === 'Overview' && <OverviewTab base={versioned} />}
        {tab === 'Life' && <LifeTab base={versioned} onSelect={onSelect} selectedId={selectedId} />}
        {tab === 'Relationships' && <RelationshipsTab base={versioned} onSelect={onSelect} />}
        {tab === 'Knowledge' && <KnowledgeTab base={versioned} onSelect={onSelect} />}
        {tab === 'Biography' && <BiographyTab base={versioned} onSelect={onSelect} scenarioId={sim.active!.id} personId={personId} />}
        {tab === 'Dialogue' && <ChatPanel scenarioId={sim.active!.id} personId={personId} name={name} />}
      </div>
    </section>
  );
}
