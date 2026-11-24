import type { World } from '../api/types';
import { fmt } from '../components/format';
import { Empty } from '../components/StateViews';
import { cultureOf, population, type PeoplesData, type PeoplesSelection, type PeoplesSettlement } from './types';

function selectedTowns(data: PeoplesData, selection: PeoplesSelection | null) {
  if (!selection) return data.settlements;
  if (selection.type === 'ancestry') return data.settlements.filter((town) => population(town.ancestries[selection.id]) > 0);
  if (selection.type === 'culture') return data.settlements.filter((town) => cultureOf(town) === selection.id);
  return data.settlements.filter((town) => cultureOf(town) === selection.cultureId &&
    town.infrastructure.some((entry) => entry.institutionId === selection.id));
}

export function PopulationViews({ data, selection, world, onSelect }: {
  data: PeoplesData; selection: PeoplesSelection | null; world: World | null; onSelect: (id: string) => void;
}) {
  const towns = selectedTowns(data, selection);
  const count = (town: PeoplesSettlement) => selection?.type === 'ancestry' ? population(town.ancestries[selection.id]) : town.population;
  const historyTowns = selection?.type === 'ancestry' ? data.settlements : towns;
  const history = data.history.map(({ day, population: bySettlement }) => ({
    day,
    count: historyTowns.reduce((total, town) => total + (selection?.type === 'ancestry' ? (bySettlement[town.id]?.[selection.id] ?? 0)
      : Object.values(bySettlement[town.id] ?? {}).reduce((sum, value) => sum + value, 0)), 0),
  }));
  const maximum = Math.max(1, ...history.map(({ count: people }) => people));
  const endDay = Math.max(1, history.at(-1)?.day ?? 0);
  const choice = selection?.type === 'culture' ? data.cultures[selection.id] : undefined;
  const present = towns.filter((town) => town.x !== null && town.y !== null);
  return <>
    <section className="section">
      <div className="section-head"><h2>Settlement distribution</h2><span className="muted">{fmt(towns.length)} settlements in scope</span></div>
      {world && present.length > 0 && <svg className="peoples-map" role="img" aria-label="Population distribution map"
        viewBox={`0 0 ${world.mapSize.width} ${world.mapSize.height}`}>
        {world.markers.map((town) => <circle key={town.id} cx={town.x} cy={town.y} r={world.mapSize.width / 450} fill="var(--border)" />)}
        {present.map((town) => <circle key={town.id} cx={town.x!} cy={town.y!}
          r={world.mapSize.width / 200 * (1 + Math.sqrt(count(town) / Math.max(1, town.population)))}
          opacity={0.35 + 0.65 * count(town) / Math.max(1, town.population)} fill="var(--accent-strong)">
          <title>{town.name} · {fmt(count(town))}</title>
        </circle>)}
      </svg>}
      {towns.length > 0 ? <div className="grid-wrap"><table className="grid">
        <thead><tr><th scope="col">Settlement</th><th scope="col">Culture</th><th scope="col">Polity</th><th scope="col">Population</th></tr></thead>
        <tbody>{towns.toSorted((a, b) => count(b) - count(a)).map((town) => <tr key={town.id}>
          <td><button className="link" type="button" onClick={() => onSelect(town.id)}>{town.name}</button></td>
          <td>{data.cultures[cultureOf(town) ?? '']?.displayName ?? 'Unmapped'}</td>
          <td>{town.polity ?? town.identity.polityId ?? 'Unspecified'}</td><td>{fmt(count(town))}</td>
        </tr>)}</tbody>
      </table></div> : <Empty>No settlements in this scenario match the selection.</Empty>}
    </section>
    {history.length > 0 && history.some(({ count }) => count > 0) && <section className="section">
      <div className="section-head"><h2>Population over time</h2></div>
      <div className="peoples-history">
        <svg viewBox="0 0 420 120" role="img" aria-label="Population history">
          <path d="M10 5 V110 H410" stroke="var(--border)" fill="none" />
          <polyline points={history.map(({ day, count: people }) =>
            `${10 + day / endDay * 400},${110 - people / maximum * 100}`).join(' ')} fill="none" stroke="var(--accent-strong)" strokeWidth="2" />
          {history.length === 1 && <circle cx={10} cy={110 - history[0].count / maximum * 100} r={3} fill="var(--accent-strong)" />}
        </svg>
        <p className="muted">Day {history[0].day} · {fmt(history[0].count)} people
          <span>Day {history.at(-1)!.day} · {fmt(history.at(-1)!.count)} people</span></p>
      </div>
    </section>}
    {choice?.relations && <section className="section">
      <div className="section-head"><h2>Cultural relations</h2></div>
      <div className="peoples-relations" aria-label={`Relations from ${choice.displayName}`}>
        <strong>{choice.displayName}</strong>
        <ul>{Object.entries(choice.relations).map(([id, relation]) => <li key={id}>
          <h3>{data.cultures[id]?.displayName ?? id}</h3>
          <p>{relation.stance}</p>
          {relation.ties.length > 0 && <p className="muted">{relation.ties.join(' · ')}</p>}
          {relation.pressurePoints.length > 0 && <p className="muted">{relation.pressurePoints.join(' · ')}</p>}
        </li>)}</ul>
      </div>
    </section>}
  </>;
}
