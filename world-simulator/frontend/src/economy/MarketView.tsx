import { useMemo, useState } from 'react';
import type { CalendarDate, Market } from '../api/types';
import { IndexedTrend, SERIES } from '../components/IndexedTrend';
import { dayLabel, price, qty, RATIONS } from './format';

/** The goods with the most value changing hands, which the chart shows until the user picks. */
function busiest(market: Market) {
  return Object.entries(market.goods).sort(([, a], [, b]) => b.demand * b.basePrice - a.demand * a.basePrice).slice(0, 5).map(([g]) => g);
}

/** Up to six chart slots; a good keeps its slot (and colour) while others are toggled. */
function useSlots(initial: string[]) {
  const [slots, setSlots] = useState<(string | null)[]>(() => SERIES.map((_, i) => initial[i] ?? null));
  const toggle = (good: string) => setSlots((cur) => {
    const at = cur.indexOf(good);
    if (at >= 0) return cur.map((g, i) => (i === at ? null : g));
    const free = cur.indexOf(null);
    return free < 0 ? cur : cur.map((g, i) => (i === free ? good : g));
  });
  return [slots, toggle] as const;
}

export function MarketView({ market, date }: { market: Market; date: CalendarDate }) {
  const initial = useMemo(() => busiest(market), [market]);
  const [slots, toggle] = useSlots(initial);
  const days = market.priceHistory.map((p) => p.day);
  const series = slots.flatMap((good, i) => (good && market.goods[good] ? [{
    id: good, name: good, color: SERIES[i], base: market.goods[good].basePrice,
    values: market.priceHistory.map((p) => p.prices[good] ?? market.goods[good].basePrice),
  }] : []));
  const goods = Object.entries(market.goods).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <IndexedTrend series={series} days={days} startLabel={days.length ? dayLabel(days[0], date) : ''} endLabel={date.label}
        label={`Prices at the ${market.centerName} market`} baseNote="Index, Azgaar price = 100" format={(v) => (v < 0.01 ? `${(v * 1000).toFixed(2)} /1,000` : v.toFixed(2))} />
      <table className="grid" aria-label={`${market.centerName} market goods`}>
        <thead><tr><th>Chart</th><th>Good</th><th className="num">Price</th><th className="num">vs Azgaar</th><th className="num">Stock</th>
          <th className="num">Demand / month</th><th className="num">Supplied</th><th className="num">Left the region</th></tr></thead>
        <tbody>{goods.map(([g, mg]) => {
          const change = mg.price / mg.basePrice - 1;
          const slot = slots.indexOf(g);
          return (
            <tr key={g} onClick={() => toggle(g)} className={slot >= 0 ? 'selected' : undefined}>
              <td><input type="checkbox" checked={slot >= 0} readOnly aria-label={`Chart ${g}`} tabIndex={-1} />
                {slot >= 0 && <i className="swatch" style={{ background: SERIES[slot] }} />}</td>
              <td>{g}</td><td className="num">{price(g, mg.price)}{g === RATIONS ? ' /1,000' : ''}</td>
              <td className={`num${Math.abs(change) > 0.25 ? ' warn-ink' : ''}`}>{change >= 0 ? '+' : ''}{(change * 100).toFixed(0)}%</td>
              <td className="num">{qty(g, mg.stock)}</td><td className="num">{qty(g, mg.demand)}</td>
              <td className="num">{qty(g, mg.supplied)}</td><td className="num">{mg.left ? qty(g, mg.left) : '—'}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </>
  );
}
