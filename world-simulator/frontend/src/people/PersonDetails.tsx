import type { PersonDetail } from '../api/types';
import { useApi } from '../api/worldApi';
import { ApiView } from '../components/StateViews';
import { dayLabel } from '../economy/format';
import { TraitBars } from '../roads/TraderParts';
import type { Simulation } from '../simulation/useSimulation';
import { TravelDetails } from '../travel/TravelDetails';
import { occupation, ROLE_LABEL } from './roles';

/** Inspector view of one named person: who they are, their household and work, and the story of their life so far. */
export function PersonDetails({ id, sim, onSelect }: { id: string; sim: Simulation; onSelect: (id: string) => void }) {
  const active = sim.active!;
  const result = useApi<PersonDetail>(`/api/scenarios/${encodeURIComponent(active.id)}/people/${encodeURIComponent(id)}?v=${sim.version}`);
  return (
    <ApiView result={result} loadingLabel="Loading person…">
      {(p) => (
        <div className="details">
          <div className="details-head">
            <h3>{p.name} {p.family} {!p.alive && <span className="chip chip-muted">died</span>}</h3>
            <code className="muted">{p.id}</code>
          </div>
          <dl className="fields">
            <div className="field"><dt>Home</dt><dd><button type="button" className="link" onClick={() => onSelect(p.settlementId)}>{p.settlementName}</button></dd></div>
            <div className="field"><dt>Age</dt><dd>{p.age}{p.alive ? '' : `, died ${dayLabel(p.deathDay ?? 0, active.date)} (${p.cause})`}</dd></div>
            <div className="field"><dt>Role</dt><dd>{ROLE_LABEL[p.role]}</dd></div>
            <div className="field"><dt>Work</dt><dd>{p.businessId
              ? <button type="button" className="link" onClick={() => onSelect(p.businessId!)}>{occupation(p)}</button>
              : p.traderId ? <button type="button" className="link" onClick={() => onSelect(p.traderId!)}>caravan master · scorecard</button>
              : occupation(p)}</dd></div>
            {p.route && <div className="field"><dt>Road</dt><dd>{p.route.settlementName} → {p.route.centerName}, with {p.route.bandits} others</dd></div>}
            {p.releaseDay != null && <div className="field"><dt>Release</dt><dd>{dayLabel(p.releaseDay, active.date)}</dd></div>}
            <div className="field"><dt>Household</dt><dd>The {p.household.family} household · {p.household.housing}</dd></div>
          </dl>
          {(p.journeyId ?? p.activeCaravanId) && <>
            <h4>Current journey</h4>
            <TravelDetails id={(p.journeyId ?? p.activeCaravanId)!} sim={sim} onSelect={onSelect} />
          </>}
          {p.household.members.length > 0 && (<>
            <h4>Lives with</h4>
            <ul className="trip-list">{p.household.members.map((m) => (
              <li key={m.id}><button type="button" className="link" onClick={() => onSelect(m.id)}>{m.name}</button> · {m.age}
                {m.alive ? ` · ${ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? m.role}` : ' · died'}</li>
            ))}</ul>
          </>)}
          <h4>Personality</h4>
          <TraitBars personality={p.personality} />
          <h4>Life so far</h4>
          <ol className="life" aria-label="Life events">
            {p.events.map((e, i) => <li key={i}><b>{dayLabel(e.day, active.date)}</b> {e.text}</li>)}
          </ol>
          <p className="muted small">A persistent character: the same id across runs and snapshots, ready for later narration and export.</p>
        </div>
      )}
    </ApiView>
  );
}
