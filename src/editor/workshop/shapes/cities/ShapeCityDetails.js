import { footprintSideLength, frontDoor } from './ShapeSidePlacement.js';

const SIDES = ['front', 'back', 'left', 'right'];
const MAX_FEATURES = 24;
// Roofs a wall turret can take; a realm's hip or flat tower roof falls back to a cone.
const TURRET_ROOFS = ['cone', 'spire', 'bell'];
const r2 = (v) => Math.round(v * 100) / 100;
const list = (v) => (Array.isArray(v) ? v : [v]);

/** Vertical span an item occupies on its wall, so upper and lower storeys are checked apart. */
function span(item, h) {
  if (item.role) return [item.bottom, item.bottom + item.height];
  if (item.kind === 'dormer') return [h, h + 4];
  if (item.kind === 'balcony') return [item.bottom ?? 0, (item.bottom ?? 0) + 2.3];
  if (item.kind === 'porch' || item.kind === 'buttress') return [0, item.height ?? 2.5];
  return [item.bottom ?? 0, (item.bottom ?? 0) + (item.height ?? 2)];
}

/**
 * A free place on one side of a host for something `width` wide spanning heights [y0, y1]:
 * the candidate nearest `prefer` (metres along the side) that keeps clear of every opening and
 * feature already there, or null when the wall is full.
 */
function makeWall(host, items) {
  const occupied = (side, y0, y1) => items().filter((i) => i.side === side && i.kind !== 'jetty').flatMap((i) => {
    const [b0, b1] = span(i, host.h);
    if (b1 <= y0 || b0 >= y1) return [];
    return list(i.along ?? 0).map((a) => [a - (i.width ?? 1) / 2, a + (i.width ?? 1) / 2]);
  });
  return (side, width, y0, y1, prefer = 0, gap = 0.3) => {
    const half = footprintSideLength(host.footprint, side) / 2 - width / 2 - 0.15;
    if (half < 0) return null;
    const taken = occupied(side, y0, y1);
    for (let step = 0; step <= 2 * half / 0.2 + 1; step++) {
      const offset = (step % 2 ? -1 : 1) * Math.ceil(step / 2) * 0.2;
      const a = r2(Math.max(-half, Math.min(half, prefer + offset)));
      if (taken.every(([lo, hi]) => a + width / 2 + gap <= lo || a - width / 2 - gap >= hi)) return a;
    }
    return null;
  };
}

/** Fill every storey of every side with windows up to a density the side's length allows. */
function addWindows(st, host, openings, free) {
  for (const side of SIDES) {
    const length = footprintSideLength(host.footprint, side);
    const target = Math.max(1, Math.min(4, Math.floor(length / 2.6)));
    for (let storey = 0; storey < host.levels; storey++) {
      const floor = (host.h * storey) / host.levels, room = host.h / host.levels;
      const bottom = r2(floor + (storey ? 0.85 : 1)), height = r2(Math.min(1.15, room - 1.25));
      if (height < 0.6 || bottom + height > host.h - 0.2) continue;
      const already = openings.filter((o) => o.side === side && o.bottom < bottom + height && o.bottom + o.height > bottom)
        .reduce((n, o) => n + list(o.along ?? 0).length, 0);
      for (let k = already; k < target; k++) {
        const prefer = -length / 2 + ((k + 0.5) * length) / target;
        const a = free(side, 0.85, bottom, bottom + height, prefer, 0.45);
        if (a === null) break;
        openings.push({ id: `dwin-${side}-${storey}-${k}`, role: 'window', side, along: a, bottom, width: 0.85, height,
          profile: st.window });
      }
    }
  }
}

/** Realm detail recipes. Each adds only where its wall is free; none ever moves authored items. */
const DETAILS = {
  porch(st, host, openings, features, free) {
    const d = frontDoor(openings);
    if (!d || features.some((f) => f.kind === 'porch')) return;
    const width = r2(Math.min(4, d.width + 1.6)), height = r2(Math.min(2.7, host.h / host.levels));
    const a = free('front', width, 0, height, d.along, 0.1);
    if (a !== null && Math.abs(a - d.along) < 0.05) features.push({ id: 'd-porch', kind: 'porch', side: 'front', along: a, width, depth: 1.4, height });
  },
  hood(st, host, openings, features, free) {
    const d = frontDoor(openings);
    if (!d || features.some((f) => f.kind === 'porch')) return;
    const width = r2(d.width + 0.8), height = r2(Math.min(2.55, host.h / host.levels));
    const a = free('front', width, 0, height, d.along, 0.05);
    if (a !== null && Math.abs(a - d.along) < 0.05) features.push({ id: 'd-hood', kind: 'porch', side: 'front', along: a, width, depth: 0.8, height });
  },
  dormers(st, host, openings, features, free) {
    if (!['gable', 'hip'].includes(host.roof.family) || features.some((f) => f.kind === 'dormer')) return;
    for (const side of host.roof.axis === 'depth' ? ['left', 'right'] : ['front', 'back']) {
      const count = Math.min(3, Math.floor(footprintSideLength(host.footprint, side) / 3.6));
      const length = footprintSideLength(host.footprint, side);
      for (let k = 0; k < count; k++) {
        const a = free(side, 1.5, host.h, host.h + 4, -length / 2 + ((k + 0.5) * length) / count, 0.6);
        if (a !== null) features.push({ id: `d-dormer-${side}-${k}`, kind: 'dormer', side, along: a, width: 1.5, depth: 1.4 });
      }
    }
  },
  balcony(st, host, openings, features, free) {
    if (host.levels < 2 || features.some((f) => f.kind === 'balcony')) return;
    const floor = r2(host.h / host.levels), length = footprintSideLength(host.footprint, 'front');
    const width = r2(Math.min(3.6, Math.max(1.8, length * 0.5)));
    const a = free('front', width, floor, floor + 2.3, 0, 0.2);
    if (a === null) return;
    features.push({ id: 'd-balcony', kind: 'balcony', side: 'front', along: a, width, depth: 0.95, bottom: floor, height: 1.05 });
    openings.push({ id: 'd-balcony-door', role: 'door', side: 'front', along: a, bottom: floor, width: 1,
      height: r2(Math.min(2.1, host.h - floor - 0.25)), profile: st.window === 'arched' ? 'arched' : 'square' });
  },
  bay(st, host, openings, features, free) {
    const room = host.h / host.levels;
    if (room < 2.5 || features.some((f) => f.kind === 'bay')) return;
    for (const side of ['left', 'right']) {
      const a = free(side, 2.1, 0, room, 0, 0.2);
      if (a !== null) return void features.push({ id: 'd-bay', kind: 'bay', side, along: a, width: 2.1, depth: 0.8, bottom: 0, height: r2(room - 0.15) });
    }
  },
  oriel(st, host, openings, features, free) {
    if (host.levels < 2 || features.some((f) => f.kind === 'bay')) return;
    const floor = host.h / host.levels, bottom = r2(floor + 0.3), height = r2(Math.min(1.9, floor - 0.6));
    for (const side of ['front', 'right', 'left']) {
      const a = free(side, 1.8, bottom, bottom + height, 0, 0.2);
      if (a !== null) return void features.push({ id: 'd-oriel', kind: 'bay', side, along: a, width: 1.8, depth: 0.7, bottom, height });
    }
  },
  buttresses(st, host, openings, features, free) {
    if (host.surface !== 'masonry' || features.some((f) => f.kind === 'buttress')) return;
    const sides = host.footprint.width >= host.footprint.depth ? ['front', 'back'] : ['left', 'right'];
    const height = r2(host.h * 0.7);
    for (const side of sides) {
      const length = footprintSideLength(host.footprint, side);
      const spots = length > 9 ? [-0.5, 0, 0.5] : [-0.5, 0.5];
      spots.forEach((f, k) => {
        const a = free(side, 0.6, 0, height, f * length * 0.9, 0.15);
        if (a !== null) features.push({ id: `d-buttress-${side}-${k}`, kind: 'buttress', side, along: a, width: 0.6, depth: 0.75, height });
      });
    }
  },
  turret(st, host, openings, features, free) {
    if (host.levels < 2 || features.some((f) => f.kind === 'turret')) return;
    const length = footprintSideLength(host.footprint, 'front'), bottom = r2(host.h / host.levels + 0.3);
    if (length < 4.5) return;
    const a = free('front', 1.6, bottom, host.h + 3, length / 2, 0.2);
    if (a !== null && a > length / 4) features.push({ id: 'd-turret', kind: 'turret', side: 'front', along: a, width: 1.6,
      height: r2(Math.max(2.4, host.h - bottom + 1.2)), bottom, roof: TURRET_ROOFS.includes(st.tower.roof) ? st.tower.roof : 'cone' });
  },
};

export const CITY_DETAIL_KINDS = Object.freeze(['windows', ...Object.keys(DETAILS)]);

/**
 * The realm's facade detail recipe (`style.details`) applied to one placed volume: fuller window
 * rows, then porches, dormers, balconies, bays, buttresses or turrets, only where free.
 */
export function decorateFacade(st, host, openings, features) {
  const out = { openings: [...openings], features: [...features] };
  const details = st.details ?? [];
  for (const kind of details) if (!CITY_DETAIL_KINDS.includes(kind)) throw new Error(`Unknown city detail: ${kind}.`);
  const free = makeWall(host, () => [...out.openings, ...out.features]);
  for (const kind of details.filter((k) => k !== 'windows')) {
    if (out.features.length >= MAX_FEATURES) break;
    DETAILS[kind](st, host, out.openings, out.features, free);
  }
  if (details.includes('windows')) addWindows(st, host, out.openings, free);
  out.features = out.features.slice(0, MAX_FEATURES);
  out.openings = out.openings.slice(0, 64);
  return out;
}
