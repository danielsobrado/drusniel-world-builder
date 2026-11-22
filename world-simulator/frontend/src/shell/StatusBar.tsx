import type { Summary } from '../api/types';
import type { ApiResult } from '../api/worldApi';
import type { Simulation } from '../simulation/useSimulation';
import { fmt } from '../components/format';

export function StatusBar({ health, summary, sim }: { health: ApiResult<{ status: string }>; summary: ApiResult<Summary>; sim: Simulation }) {
  const active = sim.active;
  const budget = summary.data?.npcBudget;
  const failed = health.error ?? summary.error;
  return (
    <footer className="statusbar" role="contentinfo">
      <span className={`dot ${failed ? 'dot-bad' : health.data ? 'dot-good' : 'dot-wait'}`} />
      <span>{failed ? `Backend error: ${failed.message}` : health.data ? 'Backend connected' : 'Connecting…'}</span>
      {summary.data && <>
        <span className="sep" />
        <span>{fmt(summary.data.counts.settlements)} settlements · {summary.data.invalidRecords.length} invalid records</span>
        <span className="sep" />
        <span>NPC budget {fmt(budget!.allocated)} / {fmt(budget!.target)} {budget!.feasible ? '· feasible' : '· infeasible'}</span>
      </>}
      <span className="appbar-spacer" />
      <span>{active ? `Simulation: ${active.name} · ${active.date.label} · ${active.running ? `running ${active.speed} d/s` : 'paused'}` : 'Simulation: no scenario'}</span>
      <span className="sep" />
      <span>LLM jobs: none</span>
    </footer>
  );
}
