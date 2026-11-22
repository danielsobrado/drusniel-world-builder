import { Icon } from '../shell/Icon';
import type { Simulation } from './useSimulation';

const STEPS = [['day', 'Day'], ['month', 'Month'], ['year', 'Year']] as const;

/** Scenario, date and clock controls in the app bar; the same controls drive every workspace. */
export function SimulationControls({ sim }: { sim: Simulation }) {
  const { active, config, busy } = sim;
  const running = Boolean(active?.running);
  return (
    <div className="sim-controls" role="group" aria-label="Simulation controls">
      <label className="appbar-field">
        <span>Scenario</span>
        <select value={active?.id ?? ''} onChange={(e) => sim.select(e.target.value)} disabled={!sim.scenarios.length} aria-label="Active scenario">
          {sim.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <span className="sim-date" title={active ? `Day ${active.date.day}` : undefined}>{active?.date.label ?? '—'}</span>
      {STEPS.map(([unit, label]) => (
        <button key={unit} type="button" className="btn btn-compact" disabled={!active || running || busy}
          title={`Advance one ${unit}${config ? ` (${config.stepSizes[unit]} days)` : ''}`} onClick={() => void sim.step(unit)}>
          +{label}
        </button>
      ))}
      <button type="button" className={`icon-btn${running ? ' on' : ''}`} disabled={!active || busy}
        aria-label={running ? 'Pause simulation' : 'Run simulation'} title={running ? 'Pause' : 'Run'}
        onClick={() => void (running ? sim.pause() : sim.run(active?.speed || config?.speeds[0] || 1))}>
        <Icon name={running ? 'pause' : 'play'} size={15} />
      </button>
      <select aria-label="Speed (simulated days per second)" title="Simulated days per real second" disabled={!active || busy}
        value={active?.running ? active.speed : ''} onChange={(e) => void sim.run(Number(e.target.value))}>
        <option value="" disabled>Speed</option>
        {config?.speeds.map((s) => <option key={s} value={s}>{s} d/s</option>)}
      </select>
    </div>
  );
}
