import { useState } from 'react';
import type { HistoryEventView } from '../api/types';
import { useApi } from '../api/worldApi';
import { ApiView, Empty } from '../components/StateViews';

const CATEGORIES = ['birth', 'family', 'education', 'career', 'wealth', 'travel', 'social', 'crime', 'conflict', 'health', 'trade'];
const SOURCE_LABEL: Record<string, string> = {
  simulation: 'simulated', 'generated-prehistory': 'reconstructed past', inferred: 'inferred', imported: 'imported',
  player: 'with the traveller', intervention: 'intervention',
};

/** The person's life as canonical events, filterable by category, importance and origin; an event opens in the inspector. */
export function LifeTab({ base, onSelect, selectedId }: { base: string; onSelect: (id: string) => void; selectedId: string | null }) {
  const [category, setCategory] = useState('');
  const [importance, setImportance] = useState(1);
  const [source, setSource] = useState('');
  const params = new URLSearchParams({ minImportance: String(importance) });
  if (category) params.set('category', category);
  if (source) params.set('source', source);
  const timeline = useApi<HistoryEventView[]>(`${base}/timeline?${params}`);
  return (
    <>
      <div className="inline-form">
        <select aria-label="Event category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Every kind of event</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Minimum importance" value={importance} onChange={(e) => setImportance(Number(e.target.value))}>
          <option value={1}>Everything</option><option value={3}>Important and life-defining</option><option value={5}>Life-defining only</option>
        </select>
        <select aria-label="Origin" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Simulated and reconstructed</option><option value="simulation">Simulated only</option>
          <option value="generated-prehistory">Reconstructed past only</option>
        </select>
      </div>
      <ApiView result={timeline} loadingLabel="Loading the timeline…">
        {(events) => events.length === 0 ? <Empty>No event matches.</Empty> : (
          <ol className="timeline" aria-label="Life timeline">
            {events.map((e) => {
              const role = e.participants.find((x) => base.endsWith(encodeURIComponent(x.personId)))?.role;
              return (
                <li key={e.id} className={`timeline-item importance-${e.importance}${e.id === selectedId ? ' selected' : ''}`}>
                  <button type="button" className="link timeline-link" onClick={() => onSelect(e.id)}>
                    <span className="timeline-date">{e.datePrecision === 'approximate' ? `c. ${e.date}` : e.date}</span>
                    <span>{e.summary}</span>
                  </button>
                  <span className="muted small"> {e.category}{role && role !== 'subject' ? ` · as ${role}` : ''}
                    {e.source !== 'simulation' && <span className="chip chip-muted">{SOURCE_LABEL[e.source] ?? e.source}</span>}
                    {e.causedBy.length > 0 && ' · has causes'}</span>
                </li>
              );
            })}
          </ol>
        )}
      </ApiView>
    </>
  );
}
