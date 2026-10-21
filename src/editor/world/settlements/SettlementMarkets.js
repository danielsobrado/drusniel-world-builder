/**
 * A town's markets: what kind each is, what it is called, and where its square
 * opens.
 *
 * The primary market is the square at the town's heart; a large, walled or
 * harbour town opens more squares beside its main streets — a fish market by
 * the quay, a gate market inside the wall, a market hall a few blocks out. Each
 * kind is a dressing of the same pieces (stalls, well, fountain, the pooled
 * market hall), so a famous market costs no asset of its own. Pure data, safe
 * in terrain workers.
 */

import { buildingEntry } from './SettlementBuildingCatalog.js';
import { polylineDistance, rect } from './SettlementGeometry.js';

/** Goods a town's first economic role (PlaceIdentity) is known for, to name its market by. */
const ROLE_GOODS = Object.freeze({
  'harbor-trade': 'Fish',
  'ice-whaling': 'Whale',
  mining: 'Ore',
  'smelting-forge': 'Iron',
  agriculture: 'Corn',
  'highland-pastoral': 'Wool',
  'pass-caravan-trade': 'Caravan',
  'mercantile-exchange': 'Exchange',
  'chartered-trade': 'Charter',
  'wetland-barter': 'Barter',
  scholarship: 'Book',
  'living-wood-craft': 'Timber',
  'salvage-craft': 'Rag',
  'winter-provisioning': 'Fur',
});

/** Catches sold off the boats: a hall is not named for them, the harbour market is. */
const QUAYSIDE_GOODS = new Set(['Fish', 'Whale']);

function marketName(town, kind, goods, primary) {
  switch (kind) {
    case 'grand-square': return `${town} Grand Square`;
    case 'market-hall': return `${town} ${goods && !QUAYSIDE_GOODS.has(goods) ? goods : 'Cloth'} Hall`;
    case 'harbour': return `${town} Fish Market`;
    case 'street-market': return `${town} Market Street`;
    case 'gate-market': return `${town} Gate Market`;
    default:
      if (!primary) return `${town} New Market`;
      return goods && !QUAYSIDE_GOODS.has(goods) ? `${town} ${goods} Market` : `${town} Market Square`;
  }
}

/**
 * The kinds and names of a town's markets, primary first. The primary is a grand
 * square where every main street is an avenue, a market hall where the town is
 * known for one, a market street in a street village, else a plain square.
 * Secondary squares: a market hall the grand square displaced, a second market
 * for a city or a double-market town, a harbour market, a gate market.
 */
export function marketKinds({ settlement, profile, grammar, traits, avenues }) {
  if (!profile.square) return Object.freeze([]);
  const has = (id) => traits.includes(id);
  const hallWanted = has('market-hall');
  let primary = 'square';
  if (avenues === 'all') primary = 'grand-square';
  else if (hallWanted && profile.rank >= 1) primary = 'market-hall';
  else if (grammar === 'linear' && profile.rank >= 1) primary = 'street-market';
  const kinds = [primary];
  if (hallWanted && primary !== 'market-hall' && profile.rank >= 2) kinds.push('market-hall');
  else if (profile.rank >= 3 || has('double-market')) kinds.push('square');
  if (profile.port && profile.rank >= 1 && (profile.rank >= 2 || has('harbour-market'))) kinds.push('harbour');
  if (profile.walled && has('gate-market')) kinds.push('gate-market');
  const town = settlement.name || 'The';
  const goods = ROLE_GOODS[profile.identity?.economicRoles?.[0]] ?? null;
  return Object.freeze(kinds.map((kind, index) => Object.freeze({
    kind,
    // The goods name the town's main market, not every one of its squares.
    name: marketName(town, kind, index === 0 || kind === 'market-hall' ? goods : null, index === 0),
  })));
}

/** Radius of a square opened beside a main street, by rank; a hall needs room round it. */
function sideSquareRadius(profile, kind) {
  return Math.max(kind === 'market-hall' ? 14 : 0, 8 + profile.rank * 2);
}

function pointAtDistance(points, distance) {
  let previous = null;
  for (const point of points) {
    const reach = Math.hypot(point[0], point[1]);
    if (previous && reach >= distance) {
      const from = Math.hypot(previous[0], previous[1]);
      const t = (distance - from) / Math.max(1e-6, reach - from);
      const x = previous[0] + (point[0] - previous[0]) * t;
      const z = previous[1] + (point[1] - previous[1]) * t;
      return { x, z, along: Math.atan2(point[0] - previous[0], point[1] - previous[1]) };
    }
    previous = point;
  }
  return null;
}

/**
 * A square of `radius` opened beside `street`, `distance` from the town's
 * centre: its rim a pace off the kerb, clear of every street and of the squares
 * already opened, on buildable ground all round.
 */
function besideStreet({ street, distance, radius, streets, squares, isBuildable }) {
  const at = pointAtDistance(street.points, distance);
  if (!at) return null;
  for (const side of [1, -1]) {
    const offset = street.width / 2 + radius + 1.5;
    const x = at.x + Math.cos(at.along) * side * offset;
    const z = at.z - Math.sin(at.along) * side * offset;
    const rim = Array.from({ length: 8 }, (_, index) => [x + Math.sin(index * Math.PI / 4) * radius, z + Math.cos(index * Math.PI / 4) * radius]);
    if (![[x, z], ...rim].every(([px, pz]) => isBuildable(px, pz))) continue;
    if (squares.some((square) => Math.hypot(square.x - x, square.z - z) < square.radius + radius + 12)) continue;
    if (streets.some((other) => polylineDistance(other.points, x, z) < radius + other.width / 2 + 0.5)) continue;
    return { x, z };
  }
  return null;
}

/**
 * Where a secondary market of `kind` is looked for: main streets in order of
 * preference, each with the distances from the centre to try. A harbour market
 * is measured back from where the quay road meets the water, the rest as
 * shares of the town's radius.
 */
function searchFor(kind, mains, quayBearing, townRadius, radius) {
  const shares = (list) => (street) => ({ street, distances: list.map((share) => townRadius * share) });
  if (kind === 'harbour' && quayBearing !== null) {
    const gap = (street) => Math.abs(Math.atan2(Math.sin(street.bearing - quayBearing), Math.cos(street.bearing - quayBearing)));
    return [...mains].sort((left, right) => gap(left) - gap(right)).map((street) => {
      const end = Math.min(townRadius, Math.hypot(...street.points.at(-1)));
      return { street, distances: [end - radius - 4, end - radius - 14, end - 2 * radius - 10] };
    });
  }
  if (kind === 'gate-market') return mains.map(shares([0.84, 0.76]));
  return [...mains.slice(1), ...mains.slice(0, 1)].map(shares([0.45, 0.55, 0.38, 0.65]));
}

/**
 * The squares of one town, primary first: `{ x, z, radius, kind, name }`. The
 * primary is the market square at the origin; each secondary market opens
 * beside a main street where there is room, and is dropped where there is none.
 */
export function placeSquares({ profile, signature, streets, squareRadius, quayBearing = null, isBuildable }) {
  const markets = signature?.markets ?? [];
  if (!(squareRadius > 0)) return [];
  const [primary = { kind: 'square', name: '' }, ...secondary] = markets;
  const squares = [{ x: 0, z: 0, radius: squareRadius, kind: primary.kind, name: primary.name }];
  // A main street is searched whole: an avenue and the road beyond it share a bearing.
  const whole = [];
  for (const street of streets.filter(({ kind }) => kind === 'main')) {
    const known = whole.find((entry) => entry.bearing === street.bearing);
    if (known) known.points = [...known.points, ...street.points.slice(1)];
    else whole.push({ bearing: street.bearing, width: street.width, points: street.points });
  }
  for (const market of secondary) {
    const radius = sideSquareRadius(profile, market.kind);
    let found = null;
    for (const { street, distances } of searchFor(market.kind, whole, quayBearing, profile.radius, radius)) {
      for (const distance of distances) {
        found = distance > 0 ? besideStreet({ street, distance, radius, streets, squares, isBuildable }) : null;
        if (found) break;
      }
      if (found) break;
    }
    if (found) squares.push({ ...found, radius, kind: market.kind, name: market.name });
  }
  return squares;
}

/**
 * The market hall of every square that has one, standing in its middle, its
 * door to the square's town side. Returned as plan buildings; the caller claims them.
 */
export function marketHalls(squares) {
  const halls = [];
  for (const square of squares) {
    if (square.kind !== 'market-hall') continue;
    const [width, depth] = buildingEntry('markethall', 0).footprint;
    // Face the town's centre, or for the heart square, down its first main street's axis.
    const yaw = square.x === 0 && square.z === 0 ? 0 : Math.atan2(-square.x, -square.z);
    const box = rect(square.x, square.z, width, depth, yaw);
    const front = [square.x + Math.sin(yaw) * (depth / 2 + 1.5), square.z + Math.cos(yaw) * (depth / 2 + 1.5)];
    halls.push({ kind: 'markethall', variant: 0, x: box.x, z: box.z, yaw, width, depth, front });
  }
  return halls;
}

/** Half the diagonal of the market hall: how far its corners reach into its square. */
export function marketHallReach() {
  const [width, depth] = buildingEntry('markethall', 0).footprint;
  return Math.hypot(width, depth) / 2;
}
