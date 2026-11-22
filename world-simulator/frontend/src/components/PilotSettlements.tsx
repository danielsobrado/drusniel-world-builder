import type { Pilot, PilotRole, SettlementClass } from '../api/types';
import { paths, useApi } from '../api/worldApi';
import { classLabel, fmt } from './format';
import { ApiView } from './StateViews';

function RoleCard({ role, classes, onSelect }: { role: PilotRole; classes?: SettlementClass[]; onSelect: (id: string) => void }) {
  const links = role.detail.connectivity.roadLinks;
  return (
    <article className="pilot-card">
      <header>
        <span className="pilot-role">{role.roleLabel}</span>
        <span className="badge badge-warn" title="Azgaar does not label economic specialisation; this role is inferred from the evidence below">hypothesis</span>
      </header>
      <h3>{role.name}</h3>
      <div className="muted">{role.stateName} · {role.cultureName} · source id {role.sourceId}</div>
      <dl className="pilot-stats">
        <div><dt>Population</dt><dd>{fmt(role.population)}</dd></div>
        <div><dt>Class</dt><dd>{classLabel(classes, role.class)}</dd></div>
        <div><dt>NPC budget</dt><dd>{role.npcs}</dd></div>
      </dl>
      <h4>Source evidence</h4>
      <ul className="evidence">{role.evidence.map((e) => <li key={e.detail}><span className={`ev ev-${e.kind}`}>{e.kind}</span>{e.detail}</li>)}</ul>
      <h4>Direct road neighbours</h4>
      <p className="muted">{links.length ? links.map((l) => l.name).join(', ') : `none on a shared route; joined to ${role.detail.connectivity.roadComponentId ?? 'no road network'} at route junctions`}</p>
      <button type="button" className="btn" onClick={() => onSelect(role.settlementId)}>Inspect</button>
    </article>
  );
}

export function PilotSettlements({ classes, onSelect, onShowAtlas }: {
  classes?: SettlementClass[]; onSelect: (id: string) => void; onShowAtlas: () => void;
}) {
  const result = useApi<Pilot>(paths.pilot);
  return (
    <ApiView result={result} loadingLabel="Loading pilot…">
      {(pilot) => {
        const name = (id: string) => pilot.roles.find((r) => r.settlementId === id)?.name;
        return (
          <>
            <section className="section">
              <div className="section-head">
                <h2>Three-settlement pilot</h2>
                <span className={`badge ${pilot.withinNpcTarget ? 'badge-good' : 'badge-bad'}`}>{pilot.totalNpcs} NPCs · aim {pilot.npcBudgetTarget.min}–{pilot.npcBudgetTarget.max}</span>
                <span className="badge">{pilot.mode === 'pinned' ? 'pinned in config/pilot-selection.yaml' : 'searched'}</span>
                <span className="appbar-spacer" />
                <button type="button" className="btn" onClick={onShowAtlas}>Show on atlas</button>
              </div>
              <div className="pilot-grid">{pilot.roles.map((r) => <RoleCard key={r.role} role={r} classes={classes} onSelect={onSelect} />)}</div>
            </section>
            <section className="section">
              <div className="section-head"><h2>Road distances</h2><span className="muted">Shortest path over imported roads and trails</span></div>
              <table className="grid" aria-label="Pilot road distances">
                <thead><tr><th>From</th><th>To</th><th className="num">Distance</th></tr></thead>
                <tbody>{pilot.pairwiseRoutes.map((p) => (
                  <tr key={`${p.from}-${p.to}`}><td>{name(p.from)}</td><td>{name(p.to)}</td>
                    <td className="num">{p.distance == null ? 'not connected' : `${fmt(p.distance)} ${pilot.distanceUnit}`}</td></tr>
                ))}</tbody>
              </table>
            </section>
            <section className="section">
              <div className="section-head"><h2>Why these three</h2></div>
              <ol className="reasons">{pilot.selectionOrder.map((r) => <li key={r}>{r}</li>)}</ol>
              <p className="muted small">Candidates with evidence: {Object.entries(pilot.candidateCounts).map(([k, v]) => `${k} ${v}`).join(' · ')}.
                {' '}Roles are working hypotheses for later economy experiments (production, food supply, market exchange), not specialisations recorded in the map.</p>
              {pilot.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
            </section>
          </>
        );
      }}
    </ApiView>
  );
}
