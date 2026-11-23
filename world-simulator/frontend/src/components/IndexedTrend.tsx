import { useState, type PointerEvent } from 'react';

// Categorical slots validated for the dark surface (#14171b) with the dataviz validator.
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c'];
const W = 720;
const H = 240;
const PAD = { left: 48, right: 110, top: 12, bottom: 26 };

export interface TrendSeries { id: string; name: string; color: string; base: number; values: number[] }

/**
 * Lines indexed to their own base (100 = base), so series of very different size share one
 * honest axis. End labels, a crosshair and a tooltip with the raw values.
 */
export function IndexedTrend({ series, days, startLabel, endLabel, label, format, baseNote = 'Index, scenario start = 100', scale = 'index',
  axis = (v: number) => String(v) }: {
  series: TrendSeries[]; days: number[]; startLabel: string; endLabel: string; label: string;
  format: (value: number) => string; baseNote?: string;
  /** 'index' plots value ÷ base × 100; 'value' plots the values themselves (base unused) on an axis from zero. */
  scale?: 'index' | 'value'; axis?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (days.length < 2 || !series.length) {
    return <p className="muted">Advance at least one month to see the trend.</p>;
  }
  const index = (s: TrendSeries, i: number) => (scale === 'index' ? (s.values[i] / (s.base || 1)) * 100 : s.values[i]);
  const indexed = series.flatMap((s) => s.values.map((_, i) => index(s, i)));
  const lo = scale === 'index' ? Math.min(99, Math.floor(Math.min(...indexed))) : 0;
  const hi = scale === 'index' ? Math.max(101, Math.ceil(Math.max(...indexed))) : Math.max(1, Math.ceil(Math.max(...indexed)));
  const x = (day: number) => PAD.left + ((day - days[0]) / (days.at(-1)! - days[0] || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const last = days.length - 1;
  // End labels: sorted by height, then pushed apart so converging lines never overprint.
  const labelY = new Map<string, number>();
  let floor = -Infinity;
  for (const s of [...series].sort((a, b) => y(index(a, last)) - y(index(b, last)))) {
    const want = Math.max(y(index(s, last)), floor + 13);
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
    <figure className="trend" aria-label={label}>
      <div className="trend-legend" role="list">
        {series.map((s) => <span key={s.id} role="listitem"><i style={{ background: s.color }} />{s.name}</span>)}
        <span className="muted">{baseNote}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 100 && scale === 'index' ? 'trend-grid trend-base' : 'trend-grid'} />
            <text x={PAD.left - 6} y={y(t) + 4} className="axis" textAnchor="end">{axis(t)}</text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="axis">{startLabel}</text>
        <text x={W - PAD.right} y={H - 6} className="axis" textAnchor="end">{endLabel}</text>
        {series.map((s) => (
          <g key={s.id}>
            <polyline points={s.values.map((_, i) => `${x(days[i])},${y(index(s, i))}`).join(' ')} fill="none" stroke={s.color}
              strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <line x1={W - PAD.right} x2={W - PAD.right + 5} y1={y(index(s, last))} y2={labelY.get(s.id)!} stroke={s.color} strokeWidth={1} />
            <text x={W - PAD.right + 8} y={labelY.get(s.id)! + 4} className="end-label">{s.name}</text>
          </g>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(days[hover])} x2={x(days[hover])} y1={PAD.top} y2={H - PAD.bottom} className="crosshair" />
            {series.map((s) => (
              <circle key={s.id} cx={x(days[hover])} cy={y(index(s, hover))} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
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
            <span key={s.id}><i style={{ background: s.color }} />{s.name}: {format(s.values[hover])}
              {scale === 'index' && ` (${index(s, hover).toFixed(1)})`}</span>
          ))}
        </div>
      )}
    </figure>
  );
}
