import type { Need, ScenarioState, SettlementSimState } from '../api/types';
import { useApi, type ApiResult } from '../api/worldApi';
import { pct } from '../components/format';
import type { Simulation } from '../simulation/useSimulation';

/** The active scenario's canonical state, refetched whenever the scenario changes. */
export function useScenarioState(sim: Simulation): ApiResult<ScenarioState> {
  const active = sim.active;
  return useApi<ScenarioState>(active ? `/api/scenarios/${encodeURIComponent(active.id)}/state?v=${sim.version}` : null);
}

const STATUS_ICON = { ok: '✓', strained: '!', critical: '✕' } as const;

/** Status carries an icon and a word, never colour alone. */
export function NeedsPanel({ needs }: { needs: Need[] }) {
  return (
    <div className="needs" role="list" aria-label="Needs">
      {needs.map((n) => (
        <div key={n.id} className={`need need-${n.status}`} role="listitem" title={n.explanation}>
          <div className="need-head">
            <span className="need-label">{n.label}</span>
            <span className="need-status"><span aria-hidden="true">{STATUS_ICON[n.status]}</span> {n.status}</span>
          </div>
          <div className="need-value">{pct(Math.min(n.value, 2))}</div>
          <p className="need-why">{n.explanation}</p>
        </div>
      ))}
    </div>
  );
}

export function SettlementPicker({ settlements, value, onChange, allowAll = false }: {
  settlements: SettlementSimState[]; value: string; onChange: (id: string) => void; allowAll?: boolean;
}) {
  return (
    <label className="picker">
      <span>Settlement</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Settlement">
        {allowAll && <option value="">All in scenario</option>}
        {settlements.map((s) => <option key={s.settlementId} value={s.settlementId}>{s.name}</option>)}
      </select>
    </label>
  );
}

/** Horizontal share bar with its number beside it, in text ink. */
export function ShareBar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="bar"><span style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /><b>{label}</b></div>
  );
}
