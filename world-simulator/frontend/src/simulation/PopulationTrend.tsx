import { useMemo, useState, type PointerEvent } from 'react';
import type { ScenarioState } from '../api/types';
import { fmt } from '../components/format';

// Categorical slots validated for the dark surface (#14171b) with the dataviz validator.
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c'];
const MAX_SERIES = SERIES.length;
const W = 720;
const H = 240;
const PAD = { left: 48, right: 110, top: 12, bottom: 26 };

/**
 * Population indexed to the scenario start (100 = imported), one line per settlement,
 * so settlements of very different size share one honest axis. Larger scopes show the total.
 */
export function PopulationTrend({ state }: { state: ScenarioState }) {
  const [hover, setHover] = useState<number | null>(null);
  const series = useMemo(() => {
    const first = state.history[0]?.population ?? {};
    const pick = state.settlements.length <= MAX_SERIES
      ? state.settlements.map((s) => ({ id: s.settlementId, name: s.name, base: first[s.settlementId] || 1, read: (p: Record<string, number>) => p[s.settlementId] ?? 0 }))
      : [{ id: 'total', name: 'All settlements', base: Object.values(first).reduce((a, b) => a + b, 0) || 1,
          read: (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0) }];
    return pick.map((s, i) => ({ ...s, color: SERIES[i], values: state.history.map((h) => s.read(h.population)) }));
  }, [state]);

  const days = state.history.map((h) => h.day);
  if (days.length < 2) {
    return <p className="muted">Advance at least one month to see the trend.</p>;
  }
  const indexed = series.flatMap((s) => s.values.map((v) => (v / s.base) * 100));
  const lo = Math.min(99, Math.floor(Math.min(...indexed)));
  const hi = Math.max(101, Math.ceil(Math.max(...indexed)));
  const x = (day: number) => PAD.left + ((day - days[0]) / (days.at(-1)! - days[0] || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  // End labels: sorted by height, then pushed apart so converging lines never overprint.
  const labelY = new Map<string, number>();
  let floor = -Infinity;
  for (const s of [...series].sort((a, b) => y((a.values.at(-1)! / a.base) * 100) - y((b.values.at(-1)! / b.base) * 100))) {
    const want = Math.max(y((s.values.at(-1)! / s.base) * 100), floor + 13);
    labelY.set(s.id, want);
    floor = want;
  }
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const day = days[0] + ((e.clientX - box.left) / box.width) * (days.at(-1)! - days[0]);
    let best = 0;
    days.forEach((d, i) => { if (Math.abs(d - day) < Math.abs(days[best] - day)) best = i; });
    setHover(best);
  };

  return (
    <figure className="trend" aria-label="Population trend">
      <div className="trend-legend" role="list">
        {series.map((s) => <span key={s.id} role="listitem"><i style={{ background: s.color }} />{s.name}</span>)}
        <span className="muted">Index, scenario start = 100</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" role="img" aria-label="Population indexed to the scenario start">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 100 ? 'trend-grid trend-base' : 'trend-grid'} />
            <text x={PAD.left - 6} y={y(t) + 4} className="axis" textAnchor="end">{t}</text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="axis">{state.startYear}-01-01</text>
        <text x={W - PAD.right} y={H - 6} className="axis" textAnchor="end">{state.date.label}</text>
        {series.map((s) => {
          const points = s.values.map((v, i) => `${x(days[i])},${y((v / s.base) * 100)}`).join(' ');
          const last = (s.values.at(-1)! / s.base) * 100;
          return (
            <g key={s.id}>
              <polyline points={points} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <line x1={W - PAD.right} x2={W - PAD.right + 5} y1={y(last)} y2={labelY.get(s.id)!} stroke={s.color} strokeWidth={1} />
              <text x={W - PAD.right + 8} y={labelY.get(s.id)! + 4} className="end-label">{s.name}</text>
            </g>
          );
        })}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(days[hover])} x2={x(days[hover])} y1={PAD.top} y2={H - PAD.bottom} className="crosshair" />
            {series.map((s) => (
              <circle key={s.id} cx={x(days[hover])} cy={y((s.values[hover] / s.base) * 100)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
        <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <div className="trend-tip" role="status">
          <b>Day {days[hover]}</b>
          {series.map((s) => (
            <span key={s.id}><i style={{ background: s.color }} />{s.name}: {fmt(s.values[hover])} ({((s.values[hover] / s.base) * 100).toFixed(1)})</span>
          ))}
        </div>
      )}
    </figure>
  );
}
