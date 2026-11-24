import { useState } from 'react';
import { label, type Point, type TravelData, type TravelPath } from './types';

function position(path: TravelPath, from: string, days: number, duration: number): Point {
  const points = path.fromId === from ? path.points : path.points.toReversed();
  const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
  let distance = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, days / Math.max(1, duration)));
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i];
    if (distance <= length && length > 0) {
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * distance / length,
        points[i][1] + (points[i + 1][1] - points[i][1]) * distance / length];
    }
    distance -= length;
  }
  return points.at(-1) ?? [0, 0];
}

export function TravelMap({ data, selectedId, onSelect }: {
  data: TravelData; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const [show, setShow] = useState<'all' | 'migration' | 'caravans'>('all');
  const routes = data.routes.filter((r) => show === 'all' || (show === 'migration') === r.id.startsWith('travel:'));
  const points = routes.flatMap((r) => r.points);
  if (!data.routes.length) return null;
  const [left, top, right, bottom] = points.reduce(([x0, y0, x1, y1], [x, y]) =>
    [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const width = Math.max(1, right - left), height = Math.max(1, bottom - top);
  const pad = Math.max(width, height) * 0.13;
  const dot = Math.max(width, height) / 110;
  const paths = new Map(routes.map((r) => [r.id, r]));
  const towns = new Map(routes.flatMap((route) => [[route.fromId, route.points[0]], [route.toId, route.points.at(-1)!]] as const));
  const selected = data.journeys.find((j) => j.id === selectedId) ?? data.caravans.find((c) => c.id === selectedId);
  const people = data.journeys.filter((j) => j.active).flatMap((j) => {
    const path = paths.get(j.routeId);
    if (!path) return [];
    const back = j.status === 'returning';
    const delay = j.incidents.find((i) => i.kind !== 'destination-full');
    const paused = delay ? Math.max(0, Math.min(delay.delayDays, data.day - delay.day)) : 0;
    const start = back ? j.arriveDay - path.days : j.departDay;
    return [{ id: j.id, name: `${j.origin} → ${j.destination}`, kind: 'household',
      point: position(path, back ? j.destinationId : j.originId, data.day - start - (back ? 0 : paused), path.days) }];
  });
  const trade = data.caravans.filter((c) => c.status !== 'queued').flatMap((c) => {
    const path = paths.get(c.routeId ?? '');
    if (!path) return [];
    const elapsed = data.day - c.departDay;
    const delay = Math.max(0, Math.min(c.delayDays, elapsed - Math.max(1, Math.floor(path.days / 2))));
    return [{ id: c.id, name: c.carrier ?? c.id, kind: 'caravan',
      point: position(path, c.fromId, elapsed - delay, path.days) }];
  });
  return <section className="section">
    <div className="section-head"><h2>Travel routes</h2>
      <label>Show <select value={show} onChange={(event) => setShow(event.target.value as typeof show)}>
        <option value="all">All routes</option><option value="migration">Migration</option><option value="caravans">Caravans</option>
      </select></label>
    </div>
    {points.length > 0 && <svg className="travel-map" viewBox={`${left - pad} ${top - pad} ${width + pad * 2} ${height + pad * 2}`}
      role="group" aria-label="Travel routes in the scenario">
      {routes.map((route) => <polyline key={route.id} className={`travel-path ${route.mode} ${selectedId === route.id || selected?.routeId === route.id ? 'selected' : ''}`}
        points={route.points.map((p) => p.join(',')).join(' ')} vectorEffect="non-scaling-stroke" onClick={() => onSelect(route.id)}>
        <title>{data.names[route.fromId]} ↔ {data.names[route.toId]} · {label(route.mode)}</title>
      </polyline>)}
      {[...towns].map(([id, [x, y]]) => <g key={id} className="travel-town">
        <circle cx={x} cy={y} r={dot / 2} />
        <text x={x + dot} y={y - dot / 2} fontSize={dot * 1.5}>{data.names[id]}</text>
      </g>)}
      {[...people, ...trade].map(({ id, name, kind, point }) =>
        <circle key={id} className={`travel-marker ${kind} ${selectedId === id ? 'selected' : ''}`} cx={point[0]} cy={point[1]}
          r={dot} role="button" tabIndex={0} aria-label={name} onClick={() => onSelect(id)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(id); } }}>
          <title>{name}</title>
        </circle>)}
    </svg>}
  </section>;
}
