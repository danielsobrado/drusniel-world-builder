import { beside, path, r2, shed, volume, wall } from './ShapeCityParts.js';

/** Building kinds that sit in a lived-in plot; towers, walls and stairs stand alone. */
const PLOT_KINDS = new Set(['house', 'farm', 'inn', 'shop']);
export const CITY_SURROUNDING_KINDS = Object.freeze(['path', 'yard', 'well', 'woodshed']);

/** World-space bounds of a shape (with a little clearance), from its own local frame. */
function bounds(p) {
  let local;
  if (p.kind === 'curved-volume') {
    const w = p.footprint.width / 2 + 0.5, d = p.footprint.depth / 2 + 0.5;
    local = [[-w, -d], [w, -d], [w, d], [-w, d]];
  } else {
    const l = p.length / 2, b = (p.bend ?? 0) / 2, m = (p.kind === 'traversal' ? p.width / 2 : p.thickness / 2) + 0.2;
    local = [[-l, -m], [l, -m], [l, m], [-l, m], [0, b - m], [0, b + m]];
  }
  const points = local.map((point) => beside(p, point));
  const xs = points.map(([x]) => x), zs = points.map(([, z]) => z);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * The realm's plot recipe (`style.surroundings`) around a kit building's main volume: a path
 * from its front door, a front yard wall with a gate on that path and side returns, a well
 * curb and a woodshed. Each piece is added only where it clears every shape already there.
 */
export function addSurroundings(st, kind, primitives) {
  const main = primitives[0], wanted = st.surroundings ?? [];
  for (const k of wanted) if (!CITY_SURROUNDING_KINDS.includes(k)) throw new Error(`Unknown city surrounding: ${k}.`);
  if (!PLOT_KINDS.has(kind) || !wanted.length || main?.kind !== 'curved-volume' || main.elevation > 0) return primitives;
  const out = [...primitives], rotation = main.rotation ?? 0;
  const w = main.footprint.width, d = main.footprint.depth, depth = r2(st.yard.depth * st.scale);
  const door = main.openings.find((o) => o.side === 'front' && o.bottom < 0.1 && ['door', 'arch'].includes(o.role) && !Array.isArray(o.along));
  const along = door?.along ?? 0;
  const fits = (candidate, ignore = []) => {
    const box = bounds(candidate);
    return out.every((p) => ignore.includes(p) || !overlaps(box, bounds(p)));
  };
  const add = (candidate, ignore) => (fits(candidate, ignore) ? (out.push(candidate), candidate) : null);
  const yardWall = (id, label, at, rot, length, openings = []) => wall(st, id, label, { at, rotation: rot, length: r2(length), bend: 0,
    height: st.yard.height, surface: st.yard.surface, thickness: st.yard.surface === 'planks' ? 0.22 : 0.42, openings });

  let front = null;
  if (wanted.includes('yard')) {
    const length = w + 1.6;
    front = add(yardWall('yard-front', 'Yard wall', beside(main, [0, d / 2 + depth]), rotation, length,
      door ? [{ id: 'yard-gate', at: r2(0.5 + along / length), width: 1.6 }] : []), [main]);
    if (front) for (const s of [-1, 1])
      add(yardWall(`yard-${s < 0 ? 'left' : 'right'}`, 'Yard wall', beside(main, [s * (w / 2 + 0.8), d / 2 + depth / 2]), rotation + 90, depth - 0.3), [main, front]);
  }
  if (wanted.includes('path') && door) {
    const length = r2(depth + 1.4);
    add(path(st, 'garden-path', 'Garden path', { at: beside(main, [along, d / 2 + 0.15 + length / 2]), rotation: rotation + 90, length,
      width: 1.3, mode: 'walkway', railing: false, support: 'none' }), out.filter((p) => p === main || p.kind === 'curved-wall'));
  }
  if (wanted.includes('well')) {
    const side = along > 0 ? -1 : 1;
    add(volume({ ...st, scale: 1 }, 'well', 'Well', { at: beside(main, [side * (w / 2 - 1), d / 2 + depth * 0.55]), w: 2.1, d: 2.1, h: 1, footprint: 'oval',
      surface: 'masonry', roof: { family: 'flat' }, crown: null, base: null, chimney: false, windowBoxes: false, shutters: false,
      interior: 'none', decorate: false, thickness: 0.25 }));
  }
  if (wanted.includes('woodshed')) {
    for (const s of [-1, 1]) {
      const shedWidth = 2.2 * st.scale;
      if (add(shed(st, 'woodshed', 'Woodshed', { at: beside(main, [s * (w / 2 + shedWidth / 2 + 0.35), -d / 2 + 1.6 * st.scale]), rotation,
        w: 2.2, d: 3, storey: 2.1, roof: { family: 'hip', rise: 0.8 },
        openings: [{ id: 'open', role: 'arch', side: 'front', f: 0, bottom: 0, width: 1.6, height: 1.8 }] }))) break;
    }
  }
  return out;
}
