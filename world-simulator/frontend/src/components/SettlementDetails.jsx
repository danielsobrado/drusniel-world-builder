import { useState } from 'react';
import { paths, useApi } from '../api/worldApi.js';
import { classLabel, fmt } from './format.js';
import { ApiView } from './StateViews.jsx';

/** Imported facts come from the Azgaar file; computed values come from this audit's config. */
function Field({ label, children, source = 'imported' }) {
  return (
    <div className="field">
      <dt>{label}<span className={`prov prov-${source}`} title={source === 'imported' ? 'Imported Azgaar fact (read-only)' : 'Computed by the audit from YAML config'}>{source === 'imported' ? 'src' : 'calc'}</span></dt>
      <dd>{children}</dd>
    </div>
  );
}

function Overview({ s, classes }) {
  return (
    <dl className="fields">
      <Field label="Population">{fmt(s.population)} <span className="muted">({s.populationPoints} pts)</span></Field>
      <Field label="Class" source="computed">{classLabel(classes, s.class)}</Field>
      <Field label="NPC budget" source="computed">{fmt(s.npcs)} <span className="muted">range {s.npcAllocation?.min}–{s.npcAllocation?.max}</span></Field>
      <Field label="State">{s.stateName}</Field>
      <Field label="Province">{s.provinceName ?? '—'}</Field>
      <Field label="Culture">{s.cultureName ?? '—'}</Field>
      <Field label="Capital">{s.capital ? 'Yes' : 'No'}</Field>
      <Field label="Azgaar type">{s.azgaarType} · {s.azgaarGroup}</Field>
      <Field label="Civic features">{s.civicFeatures.length ? s.civicFeatures.join(', ') : 'none'}</Field>
      <Field label="Biome">{s.geography.biome}</Field>
      <Field label="Terrain">height {s.geography.heightIndex}{s.geography.coastal ? ' · coastal' : ''}{s.geography.riverCell ? ' · river' : ''}</Field>
      <Field label="Coordinates">{s.x}, {s.y} <span className="muted">(cell {s.cell})</span></Field>
      <Field label="Extracts">{s.economy.extractedGoods.map((g) => g.name).join(', ') || 'none recorded'}</Field>
      <Field label="Crafts">{s.economy.craftedGoods.map((g) => g.name).join(', ') || 'none recorded'}</Field>
      <Field label="Market centre">{s.economy.marketCenter ? `Yes (market ${s.economy.marketId})` : 'No'}</Field>
    </dl>
  );
}

function LinkList({ title, links, unit, scale, empty, onSelect }) {
  return (
    <div className="link-block">
      <h4>{title}</h4>
      {links.length === 0 ? <p className="muted">{empty}</p> : (
        <ul className="links">
          {links.map((l) => (
            <li key={`${l.settlementId}-${l.routeId ?? 'n'}`}>
              <button type="button" className="link" onClick={() => onSelect?.(l.settlementId)}>{l.name}</button>
              <span className="muted">
                {l.group ? `${l.group} #${l.routeId} · ` : ''}{l.lengthPx != null ? `${fmt(Math.round(l.lengthPx * scale))} ${unit} by route` : `${fmt(l.distance)} ${unit} straight line`}
                {l.sameRoadComponent != null && (l.sameRoadComponent ? ' · same road network' : ' · not road-linked')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Connectivity({ c, onSelect }) {
  return (
    <div>
      <p className={c.roadConnected ? 'good' : 'bad'}>
        {c.roadConnected ? `On road network ${c.roadComponentId}` : c.onLandRoute ? 'On a route that reaches no other settlement' : 'No imported road or trail reaches this settlement'}
      </p>
      <LinkList title="Direct road/trail neighbours" scale={c.distanceScale} onSelect={onSelect} links={c.roadLinks} unit={c.distanceUnit} empty="None along a single route." />
      <LinkList title="Sea routes" scale={c.distanceScale} onSelect={onSelect} links={c.seaLinks} unit={c.distanceUnit} empty="None." />
      <LinkList title="Nearest settlements (proximity only)" scale={c.distanceScale} onSelect={onSelect} links={c.nearby} unit={c.distanceUnit} empty="—" />
    </div>
  );
}

const TABS = ['Overview', 'Connectivity', 'Data'];

export function SettlementDetails({ id, classes, onSelect }) {
  const result = useApi(paths.settlement(id));
  const [tab, setTab] = useState('Overview');
  return (
    <ApiView result={result} loadingLabel="Loading settlement…">
      {(s) => (
        <div className="details">
          <div className="details-head">
            <h3>{s.name}{s.capital && <span className="badge">♔ capital</span>}{s.pilot && <span className="badge badge-pilot">pilot</span>}</h3>
            <code className="muted">{s.id}</code>
          </div>
          <div className="subtabs" role="tablist">
            {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} className={`subtab${t === tab ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          {tab === 'Overview' && <Overview s={s} classes={classes} />}
          {tab === 'Connectivity' && <Connectivity c={s.connectivity} onSelect={onSelect} />}
          {tab === 'Data' && <pre className="raw">{JSON.stringify(s, null, 2)}</pre>}
        </div>
      )}
    </ApiView>
  );
}
