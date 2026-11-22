import { Icon } from './Icon.jsx';

/** Breadcrumb and workspace tabs under the app bar, with the side-panel toggles. */
export function WorkspaceBar({ world, workspaces, active, onSelect, layout, update }) {
  return (
    <div className="workspace-bar">
      <button type="button" className={`icon-btn${layout.leftOpen ? ' on' : ''}`} title="Toggle explorer ([)" aria-label="Toggle explorer" aria-pressed={layout.leftOpen}
        onClick={() => update({ leftOpen: !layout.leftOpen })}><Icon name="panelLeft" /></button>
      <span className="crumb">{world?.name ?? 'World'}</span>
      <span className="crumb-sep">/</span>
      <div className="tabs" role="tablist">
        {workspaces.map((w) => (
          <button key={w.id} type="button" role="tab" aria-selected={w.id === active} className={`tab${w.id === active ? ' active' : ''}`}
            onClick={() => onSelect(w.id)}>{w.label}</button>
        ))}
      </div>
      <span className="appbar-spacer" />
      <button type="button" className={`icon-btn${layout.rightOpen ? ' on' : ''}`} title="Toggle inspector (])" aria-label="Toggle inspector" aria-pressed={layout.rightOpen}
        onClick={() => update({ rightOpen: !layout.rightOpen })}><Icon name="panelRight" /></button>
    </div>
  );
}
