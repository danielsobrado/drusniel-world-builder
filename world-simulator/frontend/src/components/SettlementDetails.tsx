import type { ReactNode } from 'react';
import type { Link, ScenarioState, SettlementClass, SettlementDetail } from '../api/types';
import type { Simulation } from '../simulation/useSimulation';
import { useState } from 'react';
import { paths, useApi } from '../api/worldApi';
import { classLabel, fmt } from './format';
import { ApiView } from './StateViews';

/** Imported facts come from the Azgaar file; computed values come from this audit's config. */
function Field({ label, children, source = 'imported' }: { label: string; children: ReactNode; source?: 'imported' | 'computed' }) {
  return (
    <div className="field">
      <dt>{label}<span className={`prov prov-${source}`} title={source === 'imported' ? 'Imported Azgaar fact (read-only)' : 'Computed by the audit from YAML config'}>{source === 'imported' ? 'src' : 'calc'}</span></dt>
      <dd>{children}</dd>
    </div>
  );
}

function Overview({ s, classes }: { s: SettlementDetail; classes?: SettlementClass[] }) {
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

function LinkList({ title, links, unit, scale, empty, onSelect }: {
  title: string; links: Link[]; unit: string; scale: number; empty: string; onSelect?: (id: string) => void;
}) {
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

function Connectivity({ c, onSelect }: { c: SettlementDetail['connectivity']; onSelect?: (id: string) => void }) {
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

function SimulationTab({ sim, id }: { sim: Simulation; id: string }) {
  const active = sim.active!;
  const state = useApi<ScenarioState>(`/api/scenarios/${encodeURIComponent(active.id)}/state?v=${sim.version}`);
  return (
    <ApiView result={state} loadingLabel="Loading scenario state…">
      {(s) => {
        const mine = s.settlements.find((x) => x.settlementId === id);
        if (!mine) return <p className="muted">Not in the scope of scenario {active.name}.</p>;
        const start = s.history[0]?.population[id] ?? mine.population;
        return (
          <dl className="fields">
            <Field label="Scenario" source="computed">{active.name} · {s.date.label}</Field>
            <Field label="Population" source="computed">{fmt(mine.population)} <span className="muted">(start {fmt(start)})</span></Field>
            <Field label="Children" source="computed">{fmt(mine.cohorts.children)}</Field>
            <Field label="Adults" source="computed">{fmt(mine.cohorts.adults)}</Field>
            <Field label="Elders" source="computed">{fmt(mine.cohorts.elders)}</Field>
            <Field label="Births · deaths" source="computed">{fmt(mine.births)} · {fmt(mine.deaths)}</Field>
          </dl>
        );
      }}
    </ApiView>
  );
}

const BASE_TABS = ['Overview', 'Connectivity', 'Data'];

export function SettlementDetails({ id, classes, onSelect, sim }: {
  id: string; classes?: SettlementClass[]; onSelect?: (id: string) => void; sim?: Simulation;
}) {
  const result = useApi<SettlementDetail>(paths.settlement(id));
  const [tab, setTab] = useState('Overview');
  const inScenario = Boolean(sim?.active?.settlementIds.includes(id));
  const tabs = inScenario ? [...BASE_TABS, 'Simulation'] : BASE_TABS;
  return (
    <ApiView result={result} loadingLabel="Loading settlement…">
      {(s) => (
        <div className="details">
          <div className="details-head">
            <h3>{s.name}{s.capital && <span className="badge">♔ capital</span>}{s.pilot && <span className="badge badge-pilot">pilot</span>}</h3>
            <code className="muted">{s.id}</code>
          </div>
          <div className="subtabs" role="tablist">
            {tabs.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} className={`subtab${t === tab ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          {tab === 'Overview' && <Overview s={s} classes={classes} />}
          {tab === 'Connectivity' && <Connectivity c={s.connectivity} onSelect={onSelect} />}
          {tab === 'Data' && <pre className="raw">{JSON.stringify(s, null, 2)}</pre>}
          {tab === 'Simulation' && inScenario && sim && <SimulationTab sim={sim} id={id} />}
        </div>
      )}
    </ApiView>
  );
}
