const SIDES = ['back', 'right', 'front', 'left'];
const OVAL_CENTRE = { right: 0, front: 0.25, left: 0.5, back: 0.75 };
const wrap = (t) => Math.round((((t % 1) + 1) % 1) * 1e4) / 1e4;

/** The ground-floor front door (or arch) of a side-placed opening list, or undefined. */
export const frontDoor = (openings) => (openings ?? []).find((o) => o.side === 'front' && o.bottom < 0.1
  && (o.role === 'door' || o.role === 'arch') && !Array.isArray(o.along));

/** Straight run (rounded) or usable arc (oval) of one footprint side, in metres. */
export function footprintSideLength(footprint, side) {
  const { family = 'rounded', width: w, depth: d } = footprint;
  const across = SIDES.indexOf(side) % 2 ? d : w;
  if (family === 'oval') return across * 0.7;
  const r = Math.min(footprint.cornerRadius ?? 0.8, (w / 2) * 0.98, (d / 2) * 0.98);
  return across - 2 * r;
}

/**
 * Perimeter fraction (`at`) of a point on a named side of a footprint, `along` metres to the
 * viewer's right when facing that side from outside. Mirrors roundedFootprint / ovalFootprint:
 * rounded paths start at the back-left corner and run back -> right -> front -> left.
 */
export function placeOnSide(footprint, side, along = 0) {
  if (!SIDES.includes(side)) throw new Error(`Unknown footprint side: ${side}.`);
  const { family = 'rounded', width: w, depth: d } = footprint;
  if (family === 'oval') {
    const a = w / 2, b = d / 2, h = ((a - b) / (a + b)) ** 2;
    const perimeter = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    return wrap(OVAL_CENTRE[side] - along / perimeter);
  }
  if (family !== 'rounded') throw new Error(`Side placement needs a rounded or oval footprint, not ${family}.`);
  const r = Math.min(footprint.cornerRadius ?? 0.8, (w / 2) * 0.98, (d / 2) * 0.98);
  const sw = w - 2 * r, sd = d - 2 * r, q = (Math.PI * r) / 2, perimeter = 2 * (sw + sd) + 4 * q;
  const half = (SIDES.indexOf(side) % 2 ? sd : sw) / 2;
  if (Math.abs(along) > half + 1e-6) throw new Error(`Offset ${along} leaves the ${side} side (half-length ${half.toFixed(2)}).`);
  const centre = { back: sw / 2, right: sw + q + sd / 2, front: sw + 2 * q + sd + sw / 2, left: 2 * sw + 3 * q + sd + sd / 2 }[side];
  return wrap((centre - along) / perimeter);
}

/** Expand `side`/`along` (a number, or a list for a row) and `at` lists into plain `at` items. */
function expandPlaced(items, footprint, owner) {
  return (items ?? []).flatMap((item) => {
    if (Array.isArray(item.at)) return item.at.map((at, index) => ({ ...item, id: `${item.id}-${index + 1}`, at }));
    if (item.side === undefined) return [item];
    if (!footprint) throw new Error(`${owner}: side placement needs a volume footprint.`);
    const { side, along = 0, ...rest } = item;
    const offsets = Array.isArray(along) ? along : [along];
    return offsets.map((offset, index) => ({
      ...rest,
      id: offsets.length > 1 ? `${item.id}-${index + 1}` : item.id,
      at: placeOnSide(footprint, side, offset),
    }));
  });
}

export function expandPlacedPrimitive(primitive, owner = primitive.id) {
  const footprint = primitive.kind === 'curved-volume' ? primitive.footprint ?? { width: 7, depth: 5, cornerRadius: 0.8 } : null;
  const result = { ...primitive };
  for (const key of ['openings', 'features'])
    if (primitive[key]) result[key] = expandPlaced(primitive[key], footprint, `${owner}/${primitive.id}`);
  return result;
}
