import type { SettlementEconomy } from '../api/types';
import { fmt, pct } from '../components/format';
import { qty } from './format';

const SOURCE = { workshop: 'Workshop', extraction: 'Extraction', hinterland: 'Hinterland' } as const;

export function FoodTiles({ econ, daysPerMonth }: { econ: SettlementEconomy; daysPerMonth: number }) {
  const f = econ.food;
  const daily = f.wanted / daysPerMonth || 1;
  const granary = econ.inventory.Rations ?? 0;
  return (
    <div className="tiles">
      <div className={`tile ${f.security < 1 ? 'tile-bad' : 'tile-good'}`}><div className="tile-label">Food eaten</div>
        <div className="tile-value">{pct(f.security)}</div><div className="tile-note">{fmt(f.eaten)} of {fmt(f.wanted)} rations last month</div></div>
      <div className="tile"><div className="tile-label">Grown in town</div><div className="tile-value">{fmt(f.local)}</div>
        <div className="tile-note">rations by its own agriculture</div></div>
      <div className="tile"><div className="tile-label">From the hinterland</div><div className="tile-value">{fmt(f.hinterland)}</div>
        <div className="tile-note">{fmt(f.ruralPopulation)} rural inhabitants, {f.hinterlandCells} cells</div></div>
      <div className="tile"><div className="tile-label">Self-sufficiency</div><div className="tile-value">{pct(f.selfSufficiency)}</div>
        <div className="tile-note">town and hinterland against need</div></div>
      <div className="tile"><div className="tile-label">Granary</div><div className="tile-value">{fmt(Math.round(granary / daily))} days</div>
        <div className="tile-note">{fmt(Math.round(granary))} rations</div></div>
      <div className="tile"><div className="tile-label">Treasury</div><div className="tile-value">{fmt(Math.round(econ.treasury))}</div>
        <div className="tile-note">{econ.tradeBalance >= 0 ? '+' : ''}{econ.tradeBalance.toFixed(2)} last month</div></div>
    </div>
  );
}

export function ProductionTable({ econ }: { econ: SettlementEconomy }) {
  if (!econ.production.length) return <p className="muted">Azgaar records no production here.</p>;
  return (
    <table className="grid" aria-label="Production">
      <thead><tr><th>Good</th><th>Source</th><th>Inputs per month</th><th className="num">Recorded / month</th>
        <th className="num">Produced</th><th>Limited by</th></tr></thead>
      <tbody>{econ.production.map((line) => (
        <tr key={line.good}>
          <td>{line.good}</td><td>{SOURCE[line.source]}</td>
          <td className="muted">{Object.entries(line.inputs).map(([g, u]) => `${g} ${qty(g, u)}`).join(', ') || '—'}</td>
          <td className="num">{qty(line.good, line.units)}</td><td className="num">{qty(line.good, line.produced)}</td>
          <td>{line.limitedBy ? <span className="status status-strained">{line.limitedBy === 'staff' ? 'unfilled posts' : `no ${line.limitedBy}`}</span>
            : <span className="status status-ok">full output</span>}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export function StockTable({ econ }: { econ: SettlementEconomy }) {
  const short = new Map(econ.shortages.map((s) => [s.good, s]));
  const goods = [...new Set([...Object.keys(econ.inventory), ...Object.keys(econ.bought), ...Object.keys(econ.sold)])].sort();
  return (
    <table className="grid" aria-label="Stock and trade">
      <thead><tr><th>Good</th><th className="num">In stock</th><th className="num">Own use / month</th><th className="num">Bought</th>
        <th className="num">Sold</th><th>Supply</th></tr></thead>
      <tbody>{goods.map((g) => {
        const s = short.get(g);
        return (
          <tr key={g}>
            <td>{g}</td><td className="num">{qty(g, econ.inventory[g] ?? 0)}</td>
            <td className="num">{g === 'Rations' ? qty(g, econ.food.wanted) : econ.consumption[g] ? qty(g, econ.consumption[g]) : '—'}</td>
            <td className="num">{econ.bought[g] ? qty(g, econ.bought[g]) : '—'}</td><td className="num">{econ.sold[g] ? qty(g, econ.sold[g]) : '—'}</td>
            <td>{s ? <span className="status status-critical">short: {qty(g, s.obtained)} of {qty(g, s.wanted)}</span>
              : <span className="status status-ok">met</span>}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}
