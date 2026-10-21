import { buildingEntry } from './SettlementBuildingCatalog.js';
import { rect } from './SettlementGeometry.js';
import { marketHallReach } from './SettlementMarkets.js';
import { hasTrait } from './SettlementSignature.js';
import { STREET_WIDTH } from './SettlementStreets.js';

function placeProp(occupancy, props, kind, variant, x, z, yaw, { ignoreStreets = false } = {}) {
  const [width, depth] = buildingEntry(kind, variant).footprint;
  const box = rect(x, z, width, depth, yaw);
  if (!occupancy.fits(box, { clearance: 0.4, streetClearance: 0.2, ignoreStreets })) return false;
  occupancy.claim(box, { soft: true });
  props.push({ kind, variant, x, z, yaw });
  return true;
}

function pointAlong(points, distance) {
  let remaining = distance;
  for (let index = 1; index < points.length; index += 1) {
    const [ax, az] = points[index - 1];
    const [bx, bz] = points[index];
    const length = Math.hypot(bx - ax, bz - az);
    if (remaining <= length) {
      const t = remaining / length;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, along: Math.atan2(bx - ax, bz - az) };
    }
    remaining -= length;
  }
  return null;
}

/**
 * The point `distance` metres from the town's centre along a street that runs
 * out from it — a road beyond an avenue starts out at the avenue's end, not at
 * the square. Null when the street does not reach that far or starts beyond it.
 */
function pointFromCentre(points, distance) {
  const start = Math.hypot(points[0][0], points[0][1]);
  return distance < start ? null : pointAlong(points, distance - start);
}

function polylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return total;
}

/** Street lanterns at the kerb, alternating sides, inside the town. */
function streetLanterns({ profile, signature, occupancy, streets, props, random }) {
  const variant = profile.rank >= 2 ? 0 : 1;
  const spacing = (20 - profile.rank * 1.5) * (hasTrait(signature, 'lantern-lit') ? 0.7 : 1);
  for (const street of streets) {
    if (street.kind === 'walk') continue;
    const length = polylineLength(street.points);
    let side = 1;
    for (let s = spacing * (0.4 + random() * 0.6); s < length; s += spacing) {
      const at = pointAlong(street.points, s);
      if (!at || Math.hypot(at.x, at.z) > profile.radius * 1.02) continue;
      const offset = street.width / 2 + 0.7;
      // An avenue is lit down both kerbs; any other street alternates.
      for (const kerb of street.avenue ? [1, -1] : [side]) {
        const x = at.x + Math.cos(at.along) * kerb * offset;
        const z = at.z - Math.sin(at.along) * kerb * offset;
        placeProp(occupancy, props, 'lantern', variant, x, z, at.along + Math.PI / 2 * kerb, { ignoreStreets: true });
      }
      side = -side;
    }
  }
}

/** Planters down both kerbs of a planted avenue, between its lanterns. */
function avenuePlanters({ signature, occupancy, streets, props }) {
  if (!hasTrait(signature, 'planted-avenue')) return;
  for (const street of streets) {
    if (!street.avenue) continue;
    const length = polylineLength(street.points);
    for (let s = 6; s < length; s += 9) {
      const at = pointAlong(street.points, s);
      if (!at) continue;
      const offset = street.width / 2 + 0.9;
      for (const kerb of [1, -1]) {
        const x = at.x + Math.cos(at.along) * kerb * offset;
        const z = at.z - Math.sin(at.along) * kerb * offset;
        placeProp(occupancy, props, 'planter', 0, x, z, at.along, { ignoreStreets: true });
      }
    }
  }
}

/** A short paved walk from each house door to its street, and a planter by some doors. */
function doorWalks({ signature, buildings, occupancy, props, walks, random }) {
  const planters = hasTrait(signature, 'flower-town') ? 0.75 : 0.4;
  for (const building of buildings) {
    if (!building.front) continue;
    const front = [Math.sin(building.yaw), Math.cos(building.yaw)];
    const door = [building.x + front[0] * building.depth / 2, building.z + front[1] * building.depth / 2];
    const [sx, sz] = building.front;
    if (Math.hypot(sx - door[0], sz - door[1]) > 0.8) {
      walks.push({ kind: 'walk', width: STREET_WIDTH.walk, points: [door, [sx, sz]] });
    }
    if (random() < planters) {
      const across = [front[1], -front[0]];
      const side = random() < 0.5 ? -1 : 1;
      // Clear of the wall and of the walk: out past the eaves drip, beside the door.
      const x = door[0] + front[0] * 1.3 + across[0] * side * 1.9;
      const z = door[1] + front[1] * 1.3 + across[1] * side * 1.9;
      placeProp(occupancy, props, 'planter', 0, x, z, building.yaw, { ignoreStreets: true });
    }
  }
}

const TRADE_KINDS = new Set(['shop', 'tavern', 'bakery', 'warehouse', 'smithy']);

/** Goods stood out by the door of every place of trade: barrels and crates against the wall. */
function tradeGoods({ buildings, occupancy, props, random }) {
  for (const building of buildings) {
    if (!building.front || !TRADE_KINDS.has(building.kind) || random() > 0.8) continue;
    const front = [Math.sin(building.yaw), Math.cos(building.yaw)];
    const across = [front[1], -front[0]];
    const side = random() < 0.5 ? -1 : 1;
    const count = 1 + Math.floor(random() * 2);
    for (let index = 0; index < count; index += 1) {
      const along = (building.width / 2 - 1.1 - index * 1.5) * side;
      const out = building.depth / 2 + 0.75;
      placeProp(occupancy, props, 'barrels', Math.floor(random() * 2),
        building.x + front[0] * out + across[0] * along, building.z + front[1] * out + across[1] * along,
        building.yaw + (random() - 0.5) * 0.5, { ignoreStreets: true });
    }
  }
}

/**
 * The furniture of one square, by its market kind: a well, or a fountain in a
 * grand square or a fountain town, at its heart — a market hall instead where it
 * has one — stalls ringed round it facing in, benches and lanterns at the rim.
 * A grand square rings its stalls twice; a harbour market heaps goods off the
 * boats; a gate market keeps carts for the road.
 */
function squareFurniture({ profile, signature, occupancy, square, props, random }) {
  const { x: cx, z: cz, radius: squareRadius, kind } = square;
  const put = (propKind, variant, angle, distance, yaw) => props.push({
    kind: propKind, variant, x: cx + Math.sin(angle) * distance, z: cz + Math.cos(angle) * distance, yaw,
  });
  const fountain = kind === 'grand-square' || (kind === 'square' && cx === 0 && cz === 0 && hasTrait(signature, 'fountain-square'));
  if (kind !== 'market-hall') props.push({ kind: fountain ? 'fountain' : 'well', variant: 0, x: cx, z: cz, yaw: random() * Math.PI * 2 });
  const stalls = profile.market || kind !== 'square' ? 2 + profile.rank * 2 : 0;
  // Stall rings as [share of the radius, count]; round a hall, midway from its corners to the rim.
  const rings = {
    'grand-square': [[0.45, stalls], [0.74, stalls + 2]],
    'market-hall': [[(marketHallReach() + 2.5 + squareRadius * 0.9) / 2 / squareRadius, stalls]],
  }[kind] ?? [[0.62, stalls]];
  const phase = random() * Math.PI * 2;
  for (const [share, count] of rings) {
    for (let index = 0; index < count; index += 1) {
      // Each ring turned by its own share, so a grand square's two rings do not line up.
      const angle = phase + Math.PI * 2 * index / count + share;
      const radius = squareRadius * share;
      put('stall', index % 2, angle, radius, angle + Math.PI);
      if (random() < 0.5) put('barrels', index % 2, angle + 0.35, radius * 1.05, angle);
    }
  }
  if (kind === 'harbour') {
    // The day's catch and cargo, stacked between the stalls and the quay side.
    for (let index = 0; index < 4; index += 1) put('barrels', index % 2, random() * Math.PI * 2, squareRadius * 0.3, random() * Math.PI);
  }
  const rim = Math.max(4, profile.rank * 2 + 2);
  for (let index = 0; index < rim; index += 1) {
    const angle = phase + Math.PI * (2 * index + 1) / rim;
    put(index % 2 === 0 ? 'lantern' : 'bench', 0, angle, squareRadius * 0.92, angle + Math.PI);
  }
  const carts = kind === 'gate-market' ? 2 : (profile.rank >= 2 || kind === 'harbour' ? 1 : 0);
  for (let index = 0; index < carts; index += 1) {
    const angle = phase + index * Math.PI;
    put('cart', 0, angle, squareRadius * (kind === 'market-hall' ? 0.88 : 0.3), angle);
  }
  occupancy.claim(rect(cx, cz, squareRadius * 2, squareRadius * 2, 0), { soft: true });
}

/** A market street's stalls, in a row down its middle, each facing a kerb in turn. */
function marketStreetStalls({ occupancy, streets, props }) {
  for (const street of streets) {
    if (!street.market) continue;
    const length = polylineLength(street.points);
    let side = 1;
    for (let s = 5; s < length - 4; s += 8) {
      const at = pointAlong(street.points, s);
      if (!at) continue;
      placeProp(occupancy, props, 'stall', s % 16 < 8 ? 0 : 1, at.x, at.z, at.along + Math.PI / 2 * side, { ignoreStreets: true });
      side = -side;
    }
  }
}

/** A signpost where each main road enters the town, and a wayside shrine or cross further out. */
function roadMarkers({ profile, occupancy, streets, props, random }) {
  for (const street of streets.filter(({ kind, avenue }) => kind === 'main' && !avenue)) {
    for (const [kind, distance] of [['signpost', profile.radius * 1.04], ['shrine', profile.radius * (1.3 + random() * 0.3)]]) {
      const at = pointFromCentre(street.points, distance);
      if (!at) continue;
      const side = random() < 0.5 ? -1 : 1;
      const offset = street.width / 2 + 1.4;
      placeProp(
        occupancy,
        props,
        kind,
        kind === 'shrine' ? Math.floor(random() * 2) : 0,
        at.x + Math.cos(at.along) * side * offset,
        at.z - Math.sin(at.along) * side * offset,
        at.along - Math.PI / 2 * side,
        { ignoreStreets: true },
      );
    }
  }
}

/** Rail fences round each farm field, in 4 m lengths, leaving a gate gap on the farm side. */
function fieldFences({ fields, props }) {
  const length = buildingEntry('fence', 0).width;
  for (const field of fields) {
    const box = rect(field.x, field.z, field.width, field.depth, field.yaw);
    const sides = [
      { center: [0, field.depth / 2], run: field.width, yaw: field.yaw, gate: true },
      { center: [0, -field.depth / 2], run: field.width, yaw: field.yaw },
      { center: [field.width / 2, 0], run: field.depth, yaw: field.yaw + Math.PI / 2 },
      { center: [-field.width / 2, 0], run: field.depth, yaw: field.yaw + Math.PI / 2 },
    ];
    for (const side of sides) {
      const count = Math.max(1, Math.floor(side.run / length));
      for (let index = 0; index < count; index += 1) {
        if (side.gate && index === Math.floor(count / 2)) continue;
        const offset = -side.run / 2 + length * (index + 0.5) + (side.run - count * length) / 2;
        const local = side.yaw === field.yaw ? [offset, side.center[1]] : [side.center[0], offset];
        const x = box.x + box.ax[0] * local[0] + box.az[0] * local[1];
        const z = box.z + box.ax[1] * local[0] + box.az[1] * local[1];
        // Fence runs along local x; a side fence is turned a quarter.
        props.push({ kind: 'fence', variant: 0, x, z, yaw: side.yaw === field.yaw ? field.yaw : field.yaw + Math.PI / 2 });
      }
    }
  }
}

function regionalOverlayProps({ profile, occupancy, streets, squareRadius, props, random }) {
  if (!profile.hasRegionalIdentity || !profile.recipe) return;
  const candidates = [
    ...(profile.recipe.regionalProps ?? []),
    ...(profile.recipe.overlayModules ?? []),
  ];
  if (!candidates.length) return;
  const mains = streets.filter(({ kind }) => kind === 'main');
  let placedCount = 0;
  const maxRegionalProps = Math.min(candidates.length * 2, 6 + profile.rank * 3);

  for (let index = 0; index < candidates.length && placedCount < maxRegionalProps; index += 1) {
    const item = candidates[index];
    const fb = item.runtime?.fallback;
    if (!fb) continue;
    const kind = fb.settlementKind;
    const variant = fb.settlementVariant ?? 0;
    let placed = false;

    if (squareRadius > 0 && index < 3) {
      const angle = (Math.PI * 2 * index) / Math.max(3, candidates.length) + 0.25;
      const radius = squareRadius * 0.78;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      if (occupancy.isBuildable(x, z)) {
        props.push({
          kind,
          variant,
          x,
          z,
          yaw: angle + Math.PI,
          assetId: item.assetId,
          kitProp: fb.kitProp,
          ...(item.areaOverlay ? { areaOverlay: item.areaOverlay } : {}),
        });
        placed = true;
      }
    }

    if (!placed && mains.length > 0) {
      const street = mains[index % mains.length];
      const reach = Math.hypot(...street.points[0]) + polylineLength(street.points);
      const distance = Math.min(reach * 0.65, Math.max(squareRadius + 8, profile.radius * (0.35 + (index % 4) * 0.14)));
      const at = pointFromCentre(street.points, distance);
      if (at) {
        const side = index % 2 === 0 ? 1 : -1;
        const offset = street.width / 2 + 1.6;
        const x = at.x + Math.cos(at.along) * side * offset;
        const z = at.z - Math.sin(at.along) * side * offset;
        if (placeProp(occupancy, props, kind, variant, x, z, at.along - (Math.PI / 2) * side, { ignoreStreets: true })) {
          const last = props.at(-1);
          last.assetId = item.assetId;
          last.kitProp = fb.kitProp;
          if (item.areaOverlay) last.areaOverlay = item.areaOverlay;
          placed = true;
        }
      }
    }
    if (placed) placedCount += 1;
  }
}

export function planDecor({ profile, signature = null, occupancy, streets, squareRadius, squares = [], buildings, fields, random }) {
  const props = [];
  const walks = [];
  for (const square of squares) squareFurniture({ profile, signature, occupancy, square, props, random });
  marketStreetStalls({ occupancy, streets, props });
  streetLanterns({ profile, signature, occupancy, streets, props, random });
  avenuePlanters({ signature, occupancy, streets, props });
  doorWalks({ signature, buildings, occupancy, props, walks, random });
  tradeGoods({ buildings, occupancy, props, random });
  roadMarkers({ profile, occupancy, streets, props, random });
  fieldFences({ fields, props });
  regionalOverlayProps({ profile, occupancy, streets, squareRadius, props, random });
  return { props, walks };
}
