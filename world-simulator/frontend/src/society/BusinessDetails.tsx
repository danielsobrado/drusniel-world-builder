import type { Business } from '../api/types';
import { useApi } from '../api/worldApi';
import { fmt } from '../components/format';
import { ApiView } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';

/** Inspector view of one business in the active scenario. */
export function BusinessDetails({ id, sim, onSelect }: { id: string; sim: Simulation; onSelect: (id: string) => void }) {
  const active = sim.active!;
  const result = useApi<Business>(`/api/scenarios/${encodeURIComponent(active.id)}/businesses/${encodeURIComponent(id)}?v=${sim.version}`);
  return (
    <ApiView result={result} loadingLabel="Loading business…">
      {(b) => (
        <div className="details">
          <div className="details-head">
            <h3>{b.name}</h3>
            <code className="muted">{b.id}</code>
          </div>
          <dl className="fields">
            <div className="field"><dt>Settlement</dt><dd><button type="button" className="link" onClick={() => onSelect(b.settlementId)}>{b.settlementName}</button></dd></div>
            <div className="field"><dt>Sector</dt><dd className="cap">{b.sector}</dd></div>
            <div className="field"><dt>Profession</dt><dd className="cap">{b.profession}</dd></div>
            {b.good && <div className="field"><dt>Good</dt><dd>{b.good}</dd></div>}
            <div className="field"><dt>Staffing</dt><dd>{b.filled} of {b.staff} posts filled</dd></div>
            <div className="field"><dt>Wage</dt><dd>{b.wage} copper per worker-day · {fmt(b.filled * b.wage * 30)} a month</dd></div>
            {b.openedDay != null && <div className="field"><dt>Opened</dt><dd>day {b.openedDay}, funded by {b.ownerId
              ? <button type="button" className="link" onClick={() => onSelect(b.ownerId!)}>{b.ownerName ?? b.ownerId}</button> : 'the town treasury'}</dd></div>}
            {(b.idleMonths ?? 0) > 0 && <div className="field"><dt>Idle</dt><dd>{b.idleMonths} months without a worker</dd></div>}
            <div className="field"><dt>Why it exists</dt><dd>{b.evidence ?? 'Generic business sized from the labour force (config/society.yaml)'}</dd></div>
          </dl>
          <p className="muted small">Owners and named workers arrive with persistent NPCs (PR5).</p>
        </div>
      )}
    </ApiView>
  );
}
