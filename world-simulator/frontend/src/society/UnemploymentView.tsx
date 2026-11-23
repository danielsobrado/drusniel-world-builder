import { useMemo } from 'react';
import type { ScenarioState } from '../api/types';
import { IndexedTrend, SERIES } from '../components/IndexedTrend';
import { fmt, pct } from '../components/format';
import { dayLabel } from '../economy/format';

/** Unemployment rate over time, one line per settlement (or the scope total when there are many). */
export function UnemploymentTrend({ state }: { state: ScenarioState }) {
  const points = state.history.filter((h) => h.labour && h.unemployed && Object.keys(h.labour).length);
  const series = useMemo(() => {
    const rate = (h: (typeof points)[number], ids: string[]) => {
      const labour = ids.reduce((a, id) => a + (h.labour![id] ?? 0), 0);
      return labour ? (ids.reduce((a, id) => a + (h.unemployed![id] ?? 0), 0) / labour) * 100 : 0;
    };
    const groups = state.settlements.length <= SERIES.length
      ? state.settlements.map((s) => ({ id: s.settlementId, name: s.name, ids: [s.settlementId] }))
      : [{ id: 'all', name: 'All settlements', ids: state.settlements.map((s) => s.settlementId) }];
    return groups.map((g, i) => ({ id: g.id, name: g.name, color: SERIES[i], base: 1, values: points.map((h) => rate(h, g.ids)) }));
  }, [points, state.settlements]);
  return (
    <IndexedTrend series={series} days={points.map((h) => h.day)} startLabel={points.length ? dayLabel(points[0].day, state.date) : ''}
      endLabel={state.date.label} label="Share of the labour force without work" scale="value" baseNote="% of the labour force without work"
      axis={(v) => `${v}%`} format={(v) => `${v.toFixed(1)}%`} />
  );
}

/** Where the idle go: openings that employ them, guard companies, and the bands on their roads. */
export function IdleTable({ state }: { state: ScenarioState }) {
  const routes = state.trade?.routes ?? [];
  return (
    <table className="grid" aria-label="Where the idle go">
      <thead><tr><th>Settlement</th><th className="num">Labour force</th><th className="num">Without work</th><th className="num">Rate</th>
        <th className="num">Businesses opened</th><th className="num">Closed</th><th className="num">New posts</th><th className="num">Guard posts</th>
        <th className="num">On the road as bandits</th></tr></thead>
      <tbody>{state.settlements.map((s) => {
        const e = s.society.employment;
        const businesses = s.society.businesses;
        const fresh = businesses.filter((b) => b.openedDay != null);
        const guards = businesses.filter((b) => b.kind === 'caravan-guard');
        const bands = routes.filter((r) => r.settlementId === s.settlementId).reduce((a, r) => a + r.bandits, 0);
        const rate = e.labourSupply ? e.unemployed / e.labourSupply : 0;
        return (
          <tr key={s.settlementId}>
            <td>{s.name}</td><td className="num">{fmt(e.labourSupply)}</td><td className="num">{fmt(e.unemployed)}</td>
            <td className={`num${rate > 0.05 ? ' warn-ink' : ''}`}>{pct(rate)}</td>
            <td className="num">{fmt(s.economy?.opened ?? 0)}</td><td className="num">{fmt(s.economy?.closed ?? 0)}</td>
            <td className="num">{fmt(fresh.reduce((a, b) => a + b.filled, 0))} / {fmt(fresh.reduce((a, b) => a + b.staff, 0))}</td>
            <td className="num">{fmt(guards.reduce((a, b) => a + b.filled, 0))}</td>
            <td className="num">{routes.some((r) => r.settlementId === s.settlementId) ? fmt(bands) : '—'}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}
