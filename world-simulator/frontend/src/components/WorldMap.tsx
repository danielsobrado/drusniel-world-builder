import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Connectivity, Marker, RegionSummary, World } from '../api/types';
import type { Filters } from '../shell/ExplorerPanel';
import { paths, useApi } from '../api/worldApi';
import { Icon } from '../shell/Icon';
import { fmt } from './format';

// Screen-pixel radii; converted to map units each render so markers keep their size while zooming.
const RADIUS: Record<string, number> = { 'named-village': 2.5, 'small-town': 3, town: 3.6, 'large-town': 4.2, city: 5, 'major-city': 6 };

export function matchesFilters(m: Pick<Marker, 'name' | 'class' | 'stateId' | 'cultureId' | 'capital' | 'population'>, f: Filters) {
  return (!f.q || m.name.toLowerCase().includes(f.q.toLowerCase()))
    && (!f.class || m.class === f.class)
    && (!f.state || m.stateId === f.state)
    && (!f.culture || m.cultureId === f.culture)
    && (!f.capital || String(m.capital) === f.capital)
    && (f.minPopulation === '' || m.population >= Number(f.minPopulation))
    && (f.maxPopulation === '' || m.population <= Number(f.maxPopulation));
}

/** 2D inspection map in Azgaar source coordinates: wheel zooms, drag pans, click selects. */
export function WorldMap({ world, states, filters, selectedId, onSelect }: {
  world: World; states?: RegionSummary[]; filters: Filters; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const { width, height } = world.mapSize;
  const home = { x: 0, y: 0, w: width, h: height };
  const [view, setView] = useState(home);
  const [layers, setLayers] = useState<Record<'land' | 'sea' | 'labels', boolean>>({ land: true, sea: false, labels: true });
  const connectivity = useApi<Connectivity>(paths.connectivity);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ start: { x: number; y: number }; view: typeof view; moved: boolean } | null>(null);
  const colors = useMemo(() => new Map((states ?? []).map((s) => [s.id, s.color])), [states]);
  const [box, setBox] = useState({ w: 1000, h: 500 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width || 1, h: entry.contentRect.height || 1 }));
    observer.observe(svg.current!);
    return () => observer.disconnect();
  }, []);
  const px = Math.max(view.w / box.w, view.h / box.h); // map units per screen pixel

  const toMap = (event: { clientX: number; clientY: number }) => {
    const box = svg.current!.getBoundingClientRect();
    return { x: view.x + ((event.clientX - box.left) / box.width) * view.w, y: view.y + ((event.clientY - box.top) / box.height) * view.h };
  };
  const zoom = (factor: number, center = { x: view.x + view.w / 2, y: view.y + view.h / 2 }) => {
    const w = Math.min(width, Math.max(width / 40, view.w * factor));
    const h = w * (height / width);
    setView({ x: center.x - (center.x - view.x) * (w / view.w), y: center.y - (center.y - view.y) * (h / view.h), w, h });
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => { drag.current = { start: toMap(event), view, moved: false }; };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || event.buttons !== 1) return;
    const box = svg.current!.getBoundingClientRect();
    const d = drag.current;
    const dx = ((event.clientX - box.left) / box.width) * d.view.w + d.view.x - d.start.x;
    const dy = ((event.clientY - box.top) / box.height) * d.view.h + d.view.y - d.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3 * px) d.moved = true;
    if (d.moved) setView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
  };
  const pick = (id: string) => () => { if (!drag.current?.moved) onSelect(id); };
  const routes = connectivity.data?.routes ?? [];
  const showAllLabels = view.w < width / 4;

  return (
    <section className="section section-fill map-section">
      <div className="section-head">
        <h2>Atlas</h2>
        <span className="muted">{fmt(world.markers.filter((m) => matchesFilters(m, filters)).length)} of {fmt(world.markers.length)} settlements shown</span>
        <span className="appbar-spacer" />
        {([['land', 'Roads & trails'], ['sea', 'Sea routes'], ['labels', 'Labels']] as const).map(([key, label]) => (
          <label key={key} className="toggle"><input type="checkbox" checked={layers[key]} onChange={() => setLayers((l) => ({ ...l, [key]: !l[key] }))} />{label}</label>
        ))}
        <div className="map-zoom">
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => zoom(0.7)}><Icon name="plus" size={15} /></button>
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => zoom(1 / 0.7)}><Icon name="minus" size={15} /></button>
          <button type="button" className="icon-btn" aria-label="Reset view" onClick={() => setView(home)}><Icon name="reset" size={15} /></button>
        </div>
      </div>
      {connectivity.error && <p className="warn">Routes unavailable: {connectivity.error.message}</p>}
      <div className="map-frame">
        <svg ref={svg} className="map" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="Settlement map"
          onWheel={(e) => zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toMap(e))}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { setTimeout(() => { drag.current = null; }); }}>
          <rect x="0" y="0" width={width} height={height} className="map-sea" />
          {routes.filter((r) => layers[r.mode]).map((r) => (
            <polyline key={r.routeId} className={`route route-${r.group}`} points={r.points.map((p) => p.join(',')).join(' ')}
              style={{ strokeWidth: (r.group === 'roads' ? 2 : 1.1) * px }} />
          ))}
          {world.markers.map((m) => {
            const visible = matchesFilters(m, filters);
            const r = RADIUS[m.class] * px;
            const label = layers.labels && visible && (showAllLabels || m.capital || m.pilot || m.id === selectedId);
            return (
              <g key={m.id} className={`marker${visible ? '' : ' dim'}${m.id === selectedId ? ' selected' : ''}`} onClick={pick(m.id)}>
                {m.pilot && <circle cx={m.x} cy={m.y} r={r + 4 * px} className="pilot-ring" style={{ strokeWidth: 1.6 * px }} />}
                <circle cx={m.x} cy={m.y} r={r} fill={(m.stateId && colors.get(m.stateId)) || '#999'} style={{ strokeWidth: 0.8 * px }}>
                  <title>{`${m.name} · ${fmt(m.population)} · ${m.npcs} NPCs`}</title>
                </circle>
                {label && <text x={m.x + r * 1.6} y={m.y + r * 0.6} style={{ fontSize: 11 * px }}>{m.name}</text>}
              </g>
            );
          })}
        </svg>
        <div className="map-legend">
          <span><i className="lg lg-pilot" />Pilot</span><span><i className="lg lg-road" />Road</span><span><i className="lg lg-trail" />Trail</span>
          <span><i className="lg lg-sea" />Sea route</span><span className="muted">Marker size = class · colour = state</span>
        </div>
      </div>
    </section>
  );
}
