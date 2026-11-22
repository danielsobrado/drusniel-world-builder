import type { Summary, World } from '../api/types';
import { Icon } from './Icon';
import { shortHash } from '../components/format';

/** World identity and application controls; PR1 is a read-only audit, so no simulation clock yet. */
export function AppBar({ world, summary, onResetLayout }: { world: World | null; summary: Summary | null; onResetLayout: () => void }) {
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
      {settings?.year != null && <span className="chip" title={settings.era ?? ''}>Year {settings.year} {settings.era ? `· ${settings.era}` : ''}</span>}
      <span className="chip chip-muted" title="This build audits the imported world; simulation arrives in a later PR">Mode: read-only audit</span>
      <span className="appbar-spacer" />
      <span className="chip chip-muted" title={world?.sourceFingerprint}>Source {shortHash(world?.sourceFingerprint)}</span>
      <span className="chip chip-muted" title="No local model is configured in this build">Local LLM: not configured</span>
      <button type="button" className="icon-btn" title="Reset panel layout" aria-label="Reset panel layout" onClick={onResetLayout}>
        <Icon name="reset" />
      </button>
    </header>
  );
}
