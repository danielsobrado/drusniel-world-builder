import { Empty } from '../components/StateViews';
import { fmt } from '../components/format';
import { cultureOf, formatKey, population, type PeoplesData, type PeoplesSelection } from './types';

export function PeoplesInspector({ data, selection }: { data: PeoplesData | null; selection: PeoplesSelection | null }) {
  if (!data || !selection) return <Empty>Select an ancestry, culture or institution in the explorer.</Empty>;
  const { id, type } = selection;
  if (type === 'ancestry') {
    const definition = data.ancestries[id];
    if (!definition) return <Empty>This ancestry is unavailable in the active scenario.</Empty>;
    const towns = data.settlements.filter((town) => population(town.ancestries[id]) > 0);
    const sum = (band: 'children' | 'adults' | 'elders') => towns.reduce((total, town) => total + town.ancestries[id][band], 0);
    const { label, ...parameters } = definition;
    return <div className="details">
      <h3>{label}</h3>
      <dl className="fields">
        <div className="field"><dt>Population</dt><dd>{fmt(sum('children') + sum('adults') + sum('elders'))}</dd></div>
        <div className="field"><dt>Children</dt><dd>{fmt(sum('children'))}</dd></div>
        <div className="field"><dt>Adults</dt><dd>{fmt(sum('adults'))}</dd></div>
        <div className="field"><dt>Elders</dt><dd>{fmt(sum('elders'))}</dd></div>
        <div className="field"><dt>Settlement presence</dt><dd>{fmt(towns.length)}</dd></div>
      </dl>
      <h4>Simulation parameters</h4>
      <p className="muted">{Object.keys(parameters).length ? 'Experimental ancestry parameters' : 'Neutral defaults'}</p>
      <pre className="peoples-parameters">{JSON.stringify(Object.keys(parameters).length ? { ...data.neutralParameters, overrides: parameters } :
        data.neutralParameters, null, 2)}</pre>
    </div>;
  }
  const cultureId = type === 'institution' ? selection.cultureId : id;
  const culture = data.cultures[cultureId];
  const profile = data.profiles[cultureId];
  if (!culture) return <Empty>This culture is unavailable in the active scenario.</Empty>;
  if (type === 'institution') {
    const institution = profile?.institutions?.find((entry) => entry.id === id);
    if (!institution) return <Empty>This institution is unavailable in the active scenario.</Empty>;
    return <div className="details">
      <h3>{institution.label}</h3>
      <p className="muted">{culture.displayName} · Experimental</p>
      <dl className="fields">
        <div className="field"><dt>Asset</dt><dd><code>{institution.assetId}</code></dd></div>
        <div className="field"><dt>Demand source</dt><dd>{formatKey(institution.demand)}</dd></div>
        {institution.environment && <div className="field"><dt>Environment</dt><dd>{formatKey(institution.environment)}</dd></div>}
      </dl>
      <h4>Settlement demand</h4>
      <ul className="trip-list">{data.settlements.flatMap((town) => town.infrastructure
        .filter((entry) => entry.institutionId === id && entry.assetId === institution.assetId)
        .map((entry) => <li key={town.id}>{town.name} · {fmt(entry.demand)}</li>))}</ul>
    </div>;
  }
  const towns = data.settlements.filter((town) => cultureOf(town) === id);
  return <div className="details">
    <h3>{culture.displayName}</h3>
    <p className="muted">{culture.status === 'core' ? 'Established canon' : 'Cultural seed'}</p>
    <p>{culture.identity?.public ?? culture.rule}</p>
    <dl className="fields">
      <div className="field"><dt>Local population</dt><dd>{fmt(towns.reduce((total, town) => total + town.population, 0))}</dd></div>
      <div className="field"><dt>Settlement presence</dt><dd>{fmt(towns.length)}</dd></div>
      {culture.ancestry && <div className="field"><dt>Associated ancestry</dt>
        <dd>{data.ancestries[culture.ancestry]?.label ?? culture.ancestry}</dd></div>}
      {culture.values && <div className="field"><dt>Values and customs</dt><dd>{culture.values.join(', ')}</dd></div>}
      {culture.culturalPressure && <div className="field"><dt>Cultural pressure</dt><dd>{culture.culturalPressure}</dd></div>}
    </dl>
    {profile?.preferences && <>
      <h4>Experimental preferences</h4>
      <dl className="fields">{Object.entries(profile.preferences).map(([key, value]) => (
        <div className="field" key={key}><dt>{formatKey(key)}</dt><dd>{value}</dd></div>
      ))}</dl>
    </>}
    {Boolean(culture.futureCultureCandidates?.length) && <>
      <h4>Proposed regional cultures</h4>
      <ul className="trip-list">{culture.futureCultureCandidates?.map((key) => <li key={key}>{formatKey(key)}</li>)}</ul>
    </>}
  </div>;
}
