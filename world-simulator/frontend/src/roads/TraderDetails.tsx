import type { TraderDetail } from '../api/types';
import { useApi } from '../api/worldApi';
import { ApiView } from '../components/StateViews';
import { cargoText, dayLabel } from '../economy/format';
import type { Simulation } from '../simulation/useSimulation';
import { ScorecardFields, TraitBars } from './TraderParts';

/** Inspector view of one caravan master: personality, scorecard and the caravans they led. */
export function TraderDetails({ id, sim, onSelect }: { id: string; sim: Simulation; onSelect: (id: string) => void }) {
  const active = sim.active!;
  const result = useApi<TraderDetail>(`/api/scenarios/${encodeURIComponent(active.id)}/traders/${encodeURIComponent(id)}?v=${sim.version}`);
  return (
    <ApiView result={result} loadingLabel="Loading trader…">
      {(t) => (
        <div className="details">
          <div className="details-head">
            <h3>{t.name} {!t.active && <span className="chip chip-warn">dismissed</span>}</h3>
            <code className="muted">{t.id}</code>
          </div>
          <dl className="fields">
            <div className="field"><dt>Home</dt><dd><button type="button" className="link" onClick={() => onSelect(t.settlementId)}>{t.settlementName}</button></dd></div>
            <div className="field"><dt>Road</dt><dd>{t.route ? `${t.route.settlementName} → ${t.route.centerName}, ${t.route.days} days${t.route.mode === 'sea' ? ' by sea' : ''}` : '—'}</dd></div>
            {t.personId && <div className="field"><dt>Person</dt><dd><button type="button" className="link" onClick={() => onSelect(t.personId!)}>
              life story and household</button></dd></div>}
            <div className="field"><dt>Household</dt><dd>{t.household.adults} adult{t.household.adults === 1 ? '' : 's'}, {t.household.children} children</dd></div>
            <div className="field"><dt>Purse</dt><dd className={t.purse < 0 ? 'warn-ink' : undefined}>
              {t.purse < 0 ? `in debt ${(-t.purse).toFixed(1)}, which tempts them to smuggle` : t.purse.toFixed(1)}</dd></div>
            <div className="field"><dt>Status</dt><dd>{!t.active ? `let go on ${dayLabel(t.dismissedDay ?? 0, active.date)}`
              : t.busyUntil > active.date.day ? `on the road until ${dayLabel(t.busyUntil, active.date)}` : 'in town'}</dd></div>
          </dl>
          <h4>Personality</h4>
          <TraitBars personality={t.personality} />
          <h4>Scorecard</h4>
          <ScorecardFields card={t.scorecard} />
          {t.businesses.length > 0 && (<>
            <h4>Businesses funded</h4>
            <ul className="trip-list">{t.businesses.map((b) => (
              <li key={b.id}><button type="button" className="link" onClick={() => onSelect(b.id)}>{b.name}</button> · {b.filled} of {b.staff} posts filled</li>
            ))}</ul>
          </>)}
          <h4>Recent caravans</h4>
          {t.caravans.length ? (
            <ul className="trip-list">
              {t.caravans.slice(0, 12).map((c) => (
                <li key={c.id}>
                  <b>{dayLabel(c.departDay, active.date)}</b> {c.kind} · {c.guards} guards · {cargoText(c.cargo) || 'nothing left'}
                  {Object.keys(c.lost).length > 0 && <span className="status status-critical"> raided: lost {cargoText(c.lost)}</span>}
                  {c.caught && <span className="status status-critical"> caught smuggling</span>}
                  {!c.caught && c.smuggled > 0 && <span className="status status-strained"> hid {c.smuggled.toFixed(1)} from the tax</span>}
                </li>
              ))}
            </ul>
          ) : <p className="muted">No caravan on record yet.</p>}
          <p className="muted small">Traders are the first persistent characters; the rest of the NPC budget arrives in PR5.</p>
        </div>
      )}
    </ApiView>
  );
}
