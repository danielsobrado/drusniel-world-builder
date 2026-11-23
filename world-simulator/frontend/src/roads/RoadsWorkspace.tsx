import type { EconomyView, SimEvent, Trader, TradeRoute } from '../api/types';
import { useApi } from '../api/worldApi';
import { fmt, pct } from '../components/format';
import { ApiView, Empty } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import { Reputation, TraitBars } from './TraderParts';

const INCIDENTS = new Set(['raid', 'smuggling', 'dismissed', 'opened', 'closed']);

function Tiles({ view }: { view: EconomyView }) {
  const bandits = view.routes.reduce((a, r) => a + r.bandits, 0);
  const raids = view.routes.reduce((a, r) => a + r.raids, 0);
  const loot = view.routes.reduce((a, r) => a + r.lootValue, 0);
  const tax = view.markets.reduce((a, m) => a + m.taxRevenue, 0);
  const cards = view.traders.map((t) => t.scorecard);
  return (
    <div className="tiles">
      <div className={`tile ${bandits ? 'tile-bad' : 'tile-good'}`}><div className="tile-label">Bandits on the roads</div>
        <div className="tile-value">{fmt(bandits)}</div><div className="tile-note">across {view.routes.length} roads</div></div>
      <div className="tile"><div className="tile-label">Raids so far</div><div className="tile-value">{fmt(raids)}</div>
        <div className="tile-note">{loot.toFixed(0)} in goods taken</div></div>
      <div className="tile"><div className="tile-label">Market tax last month</div><div className="tile-value">{tax.toFixed(1)}</div>
        <div className="tile-note">fines and confiscations included</div></div>
      <div className="tile"><div className="tile-label">Smugglers caught</div><div className="tile-value">{fmt(cards.reduce((a, c) => a + c.caught, 0))}</div>
        <div className="tile-note">{cards.reduce((a, c) => a + c.taxEvaded, 0).toFixed(1)} tax evaded unseen</div></div>
    </div>
  );
}

function RoadsTable({ routes, traders }: { routes: TradeRoute[]; traders: Trader[] }) {
  if (!routes.length) return <Empty>No settlement in this scenario trades by caravan.</Empty>;
  return (
    <table className="grid" aria-label="Roads">
      <thead><tr><th>Road</th><th className="num">Days</th><th className="num">Bandits</th><th>Band</th><th className="num">Unguarded raid chance</th>
        <th className="num">Last month ±</th><th className="num">Raids</th><th className="num">Taken</th><th className="num">Guards asked</th><th className="num">Masters</th></tr></thead>
      <tbody>{routes.map((r) => (
        <tr key={r.id}>
          <td>{r.settlementName} → {r.centerName}{r.mode === 'sea' && <span className="chip chip-muted">sea lane</span>}</td>
          <td className="num">{r.days}</td><td className="num">{fmt(r.bandits)}</td>
          <td className="muted">{r.lair ? `${r.lair} (Azgaar ${r.mode === 'sea' ? 'sighting' : 'lair'}, never below ${r.floor})` : 'the idle of both towns'}</td>
          <td className="num">{pct(r.raidChance)}</td><td className="num">+{r.recruits} / −{r.removed}</td>
          <td className="num">{fmt(r.raids)}</td><td className="num">{r.lootValue.toFixed(1)}</td><td className="num">{r.guardsWanted}</td>
          <td className="num">{traders.filter((t) => t.routeId === r.id && t.active).length}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function Scorecards({ traders, selectedId, onSelect }: { traders: Trader[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const rows = [...traders].sort((a, b) => Number(b.active) - Number(a.active) || b.scorecard.reputation - a.scorecard.reputation);
  return (
    <table className="grid" aria-label="Trader scorecards">
      <thead><tr><th>Caravan master</th><th>Home</th><th>Personality</th><th className="num">Trips</th><th className="num">Carried</th>
        <th className="num">Tax paid</th><th className="num">Evaded</th><th className="num">Caught</th><th className="num">Raided</th>
        <th className="num">Guards / trip</th><th className="num">Purse</th><th className="num">Owns</th><th>Reputation</th></tr></thead>
      <tbody>{rows.map((t) => {
        const c = t.scorecard;
        return (
          <tr key={t.id} onClick={() => onSelect(t.id)} className={t.id === selectedId ? 'selected' : t.active ? undefined : 'muted'}>
            <td>{t.name}{!t.active && <span className="chip chip-warn">dismissed</span>}</td><td>{t.settlementName}</td>
            <td><TraitBars personality={t.personality} compact /></td>
            <td className="num">{fmt(c.trips)}</td><td className="num">{c.valueCarried.toFixed(0)}</td><td className="num">{c.taxPaid.toFixed(1)}</td>
            <td className="num">{c.taxEvaded.toFixed(1)}</td><td className="num">{fmt(c.caught)}</td><td className="num">{fmt(c.raids)}</td>
            <td className="num">{c.trips ? (c.guardsHired / c.trips).toFixed(1) : '—'}</td>
            <td className={`num${t.purse < 0 ? ' warn-ink' : ''}`}>{t.purse.toFixed(0)}</td><td className="num">{t.owns.length}</td>
            <td><Reputation value={c.reputation} /></td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function Incidents({ events }: { events: SimEvent[] }) {
  const rows = events.filter((e) => INCIDENTS.has(e.kind)).slice(0, 40);
  if (!rows.length) return <Empty>No raid, smuggling arrest or dismissal yet.</Empty>;
  return (
    <ul className="event-log" aria-label="Incidents">
      {rows.map((e) => <li key={e.seq}><span className="muted">{e.date}</span> <span className="chip chip-muted">{e.kind}</span> {e.message}</li>)}
    </ul>
  );
}

/** Roads & Traders: bandit bands, caravan guards, and the scorecards of the masters who travel. */
export function RoadsWorkspace({ sim, onSelect, selectedId }: { sim: Simulation; onSelect: (id: string) => void; selectedId: string | null }) {
  const active = sim.active;
  const id = active ? encodeURIComponent(active.id) : '';
  const view = useApi<EconomyView>(active ? `/api/scenarios/${id}/economy?delivered=0&v=${sim.version}` : null);
  const events = useApi<SimEvent[]>(active ? `/api/scenarios/${id}/events?limit=1000&v=${sim.version}` : null);
  if (!active) return <Empty>Create a scenario in the Simulation workspace first.</Empty>;
  return (
    <ApiView result={view} loadingLabel="Loading the roads…">
      {(v) => (
        <>
          <section className="section">
            <div className="section-head"><h2>Roads &amp; traders</h2><span className="muted">{active.name} · {v.date.label}</span></div>
            <Tiles view={v} />
          </section>
          <section className="section">
            <div className="section-head"><h2>Roads to market</h2>
              <span className="muted">bands recruit from the people without work and lose men to patrols</span></div>
            <div className="table-scroll"><RoadsTable routes={v.routes} traders={v.traders} /></div>
          </section>
          <section className="section">
            <div className="section-head"><h2>Trader scorecards</h2>
              <span className="muted">G greed · C caution · H honesty · click a master for their record</span></div>
            <div className="table-scroll"><Scorecards traders={v.traders} selectedId={selectedId} onSelect={onSelect} /></div>
          </section>
          <section className="section">
            <div className="section-head"><h2>Incidents</h2><span className="muted">newest first</span></div>
            {events.data ? <Incidents events={events.data} /> : <p className="muted">Loading incidents…</p>}
          </section>
        </>
      )}
    </ApiView>
  );
}
