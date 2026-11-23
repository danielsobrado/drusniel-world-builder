import { llmLabel, type LlmStatus } from '../narration/useLlm';
import type { Summary, World } from '../api/types';
import { Icon } from './Icon';
import { SimulationControls } from '../simulation/SimulationControls';
import type { Simulation } from '../simulation/useSimulation';
import { shortHash } from '../components/format';

/** World identity and application controls; PR1 is a read-only audit, so no simulation clock yet. */
export function AppBar({ world, summary, sim, onResetLayout, llm }: {
  world: World | null; summary: Summary | null; sim: Simulation; onResetLayout: () => void; llm: LlmStatus | null;
}) {
  const settings = summary?.sourceSettings;
  return (
    <header className="appbar">
      <div className="brand">
        <span className="brand-mark">DRUSNIEL</span>
        <span className="brand-sub">World Simulator</span>
      </div>
      <label className="appbar-field">
        <span>World</span>
        <select value={world?.mapId ?? ''} disabled title="The active map is set in config/simulator.yaml (world.mapId)" onChange={() => {}}>
          <option value={world?.mapId ?? ''}>{world?.name ?? 'Loading…'}</option>
        </select>
      </label>
      {settings?.year != null && <span className="chip chip-muted" title="Year the Azgaar map describes">Source year {settings.year} {settings.era ? `· ${settings.era}` : ''}</span>}
      <SimulationControls sim={sim} />
      <span className="appbar-spacer" />
      <span className="chip chip-muted" title={world?.sourceFingerprint}>Source {shortHash(world?.sourceFingerprint)}</span>
      <span className={`chip${llm?.mode === 'llm' ? '' : ' chip-muted'}`} title={llm?.hint ?? llm?.baseUrl ?? 'Local model'}>{llmLabel(llm)}</span>
      <button type="button" className="icon-btn" title="Reset panel layout" aria-label="Reset panel layout" onClick={onResetLayout}>
        <Icon name="reset" />
      </button>
    </header>
  );
}
