import type { BiographyContext, KnowledgeView, RelationshipView } from '../api/types';
import { useApi } from '../api/worldApi';
import { pct } from '../components/format';
import { ApiView, Empty } from '../components/StateViews';
import { ProseSection } from '../narration/ProseSection';
import { TraitBars } from '../roads/TraderParts';

const KIND: Record<string, string> = {
  parent: 'parent', spouse: 'spouse', sibling: 'sibling', friend: 'friend', rival: 'rival', mentor: 'mentor', employer: 'employer',
};

function relationLabel(r: RelationshipView): string {
  if (r.kind === 'parent') return r.direction === 'from' ? 'child' : 'parent';
  if (r.kind === 'mentor') return r.direction === 'from' ? 'apprentice' : 'mentor';
  if (r.kind === 'employer') return 'workplace';
  return KIND[r.kind] ?? r.kind;
}

export function RelationshipsTab({ base, onSelect }: { base: string; onSelect: (id: string) => void }) {
  const result = useApi<RelationshipView[]>(`${base}/relationships`);
  return (
    <ApiView result={result} loadingLabel="Loading relationships…">
      {(rows) => rows.length === 0 ? <Empty>No recorded relationships.</Empty> : (
        <table className="grid" aria-label="Relationships">
          <thead><tr><th>Who</th><th>Relation</th><th>Since</th><th>Until</th><th className="num">Trust</th><th>Established by</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={`${r.kind}-${r.with}-${r.since}`} onClick={() => onSelect(r.with)}>
              <td>{r.name}{!r.alive && r.kind !== 'employer' && <span className="muted"> · died</span>}</td>
              <td>{relationLabel(r)}</td><td>{r.since}</td><td>{r.until ?? '—'}</td>
              <td className={`num${r.trust < 0 ? ' warn-ink' : ''}`}>{r.trust.toFixed(2)}</td>
              <td className="muted small">{r.origin === 'generated' ? 'reconstructed past' : r.origin ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </ApiView>
  );
}

export function KnowledgeTab({ base, onSelect }: { base: string; onSelect: (id: string) => void }) {
  const result = useApi<KnowledgeView>(`${base}/knowledge`);
  return (
    <ApiView result={result} loadingLabel="Loading knowledge…">
      {(k) => (
        <>
          <p className="muted small">First-hand: {k.firstHand} events they took part in. Local news of their town is common knowledge and
            not listed. Below is what reached them second-hand.</p>
          {k.secondHand.length === 0 ? <Empty>Nothing learned second-hand yet.</Empty> : (
            <table className="grid" aria-label="Second-hand knowledge">
              <thead><tr><th>What</th><th>Learned</th><th>How</th><th className="num">Confidence</th></tr></thead>
              <tbody>{k.secondHand.map((x) => (
                <tr key={x.eventId} onClick={() => onSelect(x.eventId)}>
                  <td>{x.event?.summary ?? x.eventId}</td><td>{x.learned}</td>
                  <td>{x.how === 'told' ? `told by ${x.from ?? 'someone who was there'}` : `rumour${x.from ? ` from ${x.from}` : ' on the road'}`}</td>
                  <td className="num">{pct(x.confidence)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </ApiView>
  );
}

export function BiographyTab({ base, onSelect, scenarioId, personId }: {
  base: string; onSelect: (id: string) => void; scenarioId: string; personId: string;
}) {
  const result = useApi<BiographyContext>(`${base}/context`);
  return (
    <ApiView result={result} loadingLabel="Assembling the biography context…">
      {(c) => (
        <div className="biography">
          <ProseSection scenarioId={scenarioId} personId={personId} />
          <p className="muted small">The facts the prose was written from ({c.tier} tier: {c.targets.words[0]}–{c.targets.words[1]} words).
            Regenerating prose never changes these facts.</p>
          <h4>Narrative hooks</h4>
          {c.hooks.length ? <ul className="trip-list">{c.hooks.map((h) => <li key={h.text}>{h.text} <span className="muted small">({h.kind})</span></li>)}</ul>
            : <p className="muted">Nothing pressing.</p>}
          <h4>Outlook</h4>
          <dl className="fields">
            <div className="field"><dt>Mood</dt><dd>{c.outlook.mood}</dd></div>
            <div className="field"><dt>Fears</dt><dd>{c.outlook.fears.join(', ') || '—'}</dd></div>
            <div className="field"><dt>Ambitions</dt><dd>{c.outlook.ambitions.join(', ') || '—'}</dd></div>
            <div className="field"><dt>Values</dt><dd>{Array.isArray(c.personality.values) ? c.personality.values.join(', ') : '—'} · {String(c.personality.temperament ?? '')}</dd></div>
            <div className="field"><dt>Places</dt><dd>{c.places.join(', ')}</dd></div>
          </dl>
          <h4>Milestones the narration would use</h4>
          <ol className="timeline">{c.milestones.map((m) => (
            <li key={m.id} className="timeline-item"><button type="button" className="link timeline-link" onClick={() => onSelect(m.id)}>
              <span className="timeline-date">{m.precision === 'approximate' ? `c. ${m.date}` : m.date}</span><span>{m.summary}</span></button></li>
          ))}</ol>
          {c.settlementHistory.length > 0 && (<>
            <h4>What happened in {c.identity.home} in their time</h4>
            <ul className="trip-list">{c.settlementHistory.map((e) => <li key={e.id}><b>{e.date}</b> {e.summary}</li>)}</ul>
          </>)}
          <h4>Rules for the narrator</h4>
          <ul className="trip-list muted small">{c.restrictions.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </ApiView>
  );
}

export function OverviewTab({ base }: { base: string }) {
  const result = useApi<BiographyContext>(`${base}/context`);
  return (
    <ApiView result={result} loadingLabel="Loading…">
      {(c) => (
        <dl className="fields">
          <div className="field"><dt>Born</dt><dd>{c.identity.born} in {c.identity.birthplace}{c.identity.culture ? ` · ${c.identity.culture}` : ''}</dd></div>
          <div className="field"><dt>Lives</dt><dd>{c.identity.home}{c.household ? ` · the ${c.household.family} household, ${c.household.housing}` : ''}</dd></div>
          <div className="field"><dt>With</dt><dd>{c.household?.members.join(', ') || 'alone'}</dd></div>
          <div className="field"><dt>Work</dt><dd>{c.work.profession ? `${c.work.profession}${c.work.workplace ? ` at ${c.work.workplace}` : ''}` : c.work.role}</dd></div>
          <div className="field"><dt>Town</dt><dd>{pct(c.circumstances.townUnemployment)} without work · food {pct(c.circumstances.foodSecurity)}</dd></div>
          <div className="field"><dt>Personality</dt><dd><TraitBars personality={{ greed: Number(c.personality.greed), caution: Number(c.personality.caution),
            honesty: Number(c.personality.honesty) }} compact /></dd></div>
        </dl>
      )}
    </ApiView>
  );
}
