import { Icon } from './Icon.jsx';

export function IconRail({ workspaces, active, onSelect }) {
  return (
    <nav className="rail" aria-label="Workspaces">
      {workspaces.map((w, i) => (
        <button key={w.id} type="button" className={`rail-btn${w.id === active ? ' active' : ''}`}
          aria-current={w.id === active ? 'page' : undefined} title={`${w.label} (${i + 1})`} aria-label={w.label}
          onClick={() => onSelect(w.id)}>
          <Icon name={w.icon} size={20} />
        </button>
      ))}
    </nav>
  );
}
