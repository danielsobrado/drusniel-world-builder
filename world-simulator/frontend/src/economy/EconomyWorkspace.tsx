import { useState } from 'react';
import type { EconomyView } from '../api/types';
import { useApi } from '../api/worldApi';
import { fmt, pct } from '../components/format';
import { ApiView, Empty } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import { CaravanTable } from './CaravanTable';
import { MarketView } from './MarketView';
import { FoodTiles, ProductionTable, StockTable } from './SettlementEconomyView';

function Overview({ view }: { view: EconomyView }) {
  const econs = view.settlements.map((s) => s.economy);
  const short = [...new Set(econs.flatMap((e) => e.shortages.map((x) => x.good)))];
  const security = Math.min(...econs.map((e) => e.food.security));
  const onRoad = view.caravans.reduce((a, c) => a + c.value, 0);
  const exported = view.markets.reduce((a, m) => a + (m.goods.Rations?.left ?? 0), 0);
  return (
    <div className="tiles">
      <div className="tile"><div className="tile-label">Caravans on the road</div><div className="tile-value">{fmt(view.caravans.length)}</div>
        <div className="tile-note">carrying {onRoad.toFixed(0)} in goods</div></div>
      <div className={`tile ${short.length ? 'tile-bad' : 'tile-good'}`}><div className="tile-label">Goods short</div>
        <div className="tile-value">{short.length}</div><div className="tile-note">{short.slice(0, 4).join(', ') || 'every need met last month'}</div></div>
      <div className={`tile ${security < 1 ? 'tile-bad' : 'tile-good'}`}><div className="tile-label">Lowest food security</div>
        <div className="tile-value">{pct(security)}</div><div className="tile-note">of rations wanted, eaten</div></div>
      <div className="tile"><div className="tile-label">Food leaving the region</div><div className="tile-value">{fmt(Math.round(exported))}</div>
        <div className="tile-note">rations last month beyond market demand</div></div>
    </div>
  );
}

/** Economy & Trade: production, stock, market prices and the caravans between them. */
export function EconomyWorkspace({ sim, onSelect }: { sim: Simulation; onSelect: (id: string) => void }) {
  const active = sim.active;
  const result = useApi<EconomyView>(active ? `/api/scenarios/${encodeURIComponent(active.id)}/economy?delivered=30&v=${sim.version}` : null);
  const [picked, setPicked] = useState('');
  if (!active) return <Empty>Create a scenario in the Simulation workspace first.</Empty>;
  return (
    <ApiView result={result} loadingLabel="Loading the economy…">
      {(view) => {
        const s = view.settlements.find((x) => x.settlementId === picked) ?? view.settlements[0];
        const market = view.markets.find((m) => m.marketId === s.economy.marketId);
        const where = market ? `${s.economy.travelDays ? `${s.economy.travelDays} caravan days from` : 'centre of'} the ${market.centerName} market` : 'no market';
        return (
          <>
            <section className="section">
              <div className="section-head"><h2>Economy &amp; trade</h2><span className="muted">{active.name} · {view.date.label}</span></div>
              <Overview view={view} />
            </section>
            <section className="section">
              <div className="section-head">
                <h2>{s.name}</h2><span className="muted">{where}</span>
                <span className="appbar-spacer" />
                <label className="picker"><span>Settlement</span>
                  <select value={s.settlementId} onChange={(e) => setPicked(e.target.value)} aria-label="Settlement">
                    {view.settlements.map((x) => <option key={x.settlementId} value={x.settlementId}>{x.name}</option>)}
                  </select>
                </label>
                <button type="button" className="btn btn-compact" onClick={() => onSelect(s.settlementId)}>Inspect {s.name}</button>
              </div>
              <FoodTiles econ={s.economy} />
              <h4>Production</h4>
              <ProductionTable econ={s.economy} />
              <h4>Stock and trade last month</h4>
              <StockTable econ={s.economy} />
            </section>
            {market && (
              <section className="section">
                <div className="section-head"><h2>{market.centerName} market</h2>
                  <span className="muted">Azgaar market {market.marketId}{market.centerInScope ? '' : ' · centre outside the scenario'} · click a row to chart it</span></div>
                <MarketView key={market.marketId} market={market} date={view.date} />
              </section>
            )}
            <section className="section">
              <div className="section-head"><h2>Caravans on the road</h2></div>
              <CaravanTable caravans={view.caravans} date={view.date} delivered={false} label="Caravans on the road" />
            </section>
            <section className="section">
              <div className="section-head"><h2>Recently arrived</h2><span className="muted">newest first</span></div>
              <CaravanTable caravans={view.delivered} date={view.date} delivered label="Recently arrived caravans" />
            </section>
          </>
        );
      }}
    </ApiView>
  );
}
