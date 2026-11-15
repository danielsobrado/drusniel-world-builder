import polygonClipping from 'polygon-clipping';

const DRESSINGS = new Set(['voussoir', 'ashlar']);
/** Smallest piece of a cut field stone worth keeping, m². */
const MIN_AREA = 0.001;

const outline = (stone) => stone.contourPolygons ?? (stone.corners ? [[stone.corners]] : null);
const closed = (ring) => [...ring, ring[0]];
const area = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + x * ny - nx * y;
}, 0) / 2);

function placed(stone) {
  const polygons = outline(stone);
  if (!polygons) return null;
  const absolute = polygons.map((rings) => rings.map((ring) => closed(ring.map(([x, y]) => [stone.s + x, stone.y + y]))));
  const points = absolute.flat(2);
  return {
    polygons: absolute,
    s0: Math.min(...points.map(([s]) => s)), s1: Math.max(...points.map(([s]) => s)),
    y0: Math.min(...points.map(([, y]) => y)), y1: Math.max(...points.map(([, y]) => y)),
  };
}

const overlaps = (a, b) => a.s1 > b.s0 && a.s0 < b.s1 && a.y1 > b.y0 && a.y0 < b.y1;

/**
 * The course packer fits field stones to an opening's void and lays the jambs
 * and voussoirs over the trim band on top of them; the workshop wants that, since
 * its masks read the field silhouette. Extruded flush as they are here, the two
 * share faces round every dressed arch, so cut the field stones back to where the
 * dressings begin.
 *
 * @returns {Map<object, number[][][][]>} for each field stone a dressing reaches,
 *   its remaining outline in its own local coordinates (empty when nothing is left)
 */
export function clipFieldToDressings(stones) {
  const dressings = stones.filter((stone) => DRESSINGS.has(stone.category)).map(placed).filter(Boolean);
  const cut = new Map();
  if (dressings.length === 0) return cut;
  for (const stone of stones) {
    if (DRESSINGS.has(stone.category) || stone.category === 'coping') continue;
    const field = placed(stone);
    if (!field) continue;
    const near = dressings.filter((dressing) => overlaps(field, dressing));
    if (near.length === 0) continue;
    let remaining;
    try {
      remaining = polygonClipping.difference(field.polygons, ...near.map((dressing) => dressing.polygons));
    } catch {
      continue; // shortcut: degenerate input keeps the stone whole, as before this cut existed.
    }
    const local = remaining.map((rings) => rings.map((ring) => ring.slice(0, -1).map(([s, y]) => [s - stone.s, y - stone.y])))
      .filter((rings) => area(rings[0]) > MIN_AREA);
    const before = field.polygons.reduce((sum, rings) => sum + area(rings[0].slice(0, -1)), 0);
    const after = local.reduce((sum, rings) => sum + area(rings[0]), 0);
    if (Math.abs(before - after) > 1e-6) cut.set(stone, local);
  }
  return cut;
}
