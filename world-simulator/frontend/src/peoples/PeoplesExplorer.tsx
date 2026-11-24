import type { PeoplesData, PeoplesSelection } from './types';

export function PeoplesExplorer({ data, selection, onSelect }: {
  data: PeoplesData | null;
  selection: PeoplesSelection | null;
  onSelect: (value: PeoplesSelection) => void;
}) {
  const entries = [
    { name: 'Ancestries', items: Object.entries(data?.ancestries ?? {}).map(([id, row]) =>
      ({ value: { type: 'ancestry', id } as const, label: row.label })) },
    { name: 'Cultures', items: Object.entries(data?.cultures ?? {}).map(([id, row]) =>
      ({ value: { type: 'culture', id } as const, label: row.displayName, seed: row.status === 'seed' })) },
    { name: 'Institutions', items: Object.entries(data?.profiles ?? {}).flatMap(([cultureId, profile]) =>
      (profile.institutions ?? []).map((row) => ({ value: { type: 'institution', id: row.id, cultureId } as const, label: row.label }))) },
  ];
  return (
    <aside className="explorer" aria-label="Peoples & Cultures explorer">
      <div className="panel-title">Peoples &amp; Cultures</div>
      {entries.map(({ name, items }) => (
        <details className="people-group" key={name} open>
          <summary>{name}</summary>
          <ul className="tree">
            {items.toSorted((a, b) => a.label.localeCompare(b.label)).map((item) => (
              <li key={item.value.type === 'institution' ? `${item.value.cultureId}:${item.value.id}` : item.value.id}>
                <button type="button" className="tree-leaf" aria-pressed={selection?.type === item.value.type && selection.id === item.value.id}
                  onClick={() => onSelect(item.value)}>
                  {item.label}{'seed' in item && item.seed && <span className="muted"> · Seed</span>}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </aside>
  );
}
