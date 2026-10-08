import { rect, rectsOverlap } from './SettlementGeometry.js';

/**
 * The small made things that tell one building from the next and put life in
 * the farm belt: hanging signs, awnings, ivy, stairs up to the wall-walk, sheep
 * and hens. Each kind is a little pool of variants of a mesh built by the view
 * (SettlementTrimMesh); this module only decides where they go. Pure data.
 */
export const SETTLEMENT_TRIM = Object.freeze({
  shopSign: Object.freeze({ variants: 4 }),
  awning: Object.freeze({ variants: 3 }),
  ivyPatch: Object.freeze({ variants: 3 }),
  wallStair: Object.freeze({ variants: 1 }),
  sheep: Object.freeze({ variants: 2 }),
  hen: Object.freeze({ variants: 2 }),
});

/** The wall-walk stair: a straight flight inside the wall, as the mesh and the collider both build it. */
export const WALL_STAIR = Object.freeze({ rise: 0.3, run: 0.45, width: 1.3, height: 6 });

/** Metres a house wall stands inside the plot the planner reserved for it. */
const WALL_INSET = 0.5;
const SIGN_KINDS = new Set(['shop', 'tavern', 'bakery', 'smithy']);
const AWNING_KINDS = new Set(['shop', 'bakery', 'tavern']);
const IVY_KINDS = new Set(['house', 'townhouse', 'farmhouse', 'chapel']);
const MASONRY_KINDS = new Set(['wall', 'tower', 'gatehouse']);
/** One wall length in this many carries a stair. */
const STAIR_EVERY = 7;

export function isTrimKind(kind) {
  return Object.hasOwn(SETTLEMENT_TRIM, kind);
}

function trim(kind, x, z, yaw, random) {
  return { kind, variant: Math.floor(random() * SETTLEMENT_TRIM[kind].variants), x, z, yaw };
}

/** A point on a building's front wall, `along` metres from its middle and `out` metres proud of it. */
function onFront(building, along, out) {
  const front = [Math.sin(building.yaw), Math.cos(building.yaw)];
  const across = [front[1], -front[0]];
  const reach = building.depth / 2 - WALL_INSET + out;
  return [building.x + front[0] * reach + across[0] * along, building.z + front[1] * reach + across[1] * along];
}

function shopFronts({ buildings, random }, props) {
  for (const building of buildings) {
    if (!building.front) continue;
    if (SIGN_KINDS.has(building.kind)) {
      const side = random() < 0.5 ? -1 : 1;
      const [x, z] = onFront(building, side * Math.min(1.7, building.width / 2 - 1), 0);
      props.push(trim('shopSign', x, z, building.yaw, random));
    }
    if (AWNING_KINDS.has(building.kind) && random() < 0.6) {
      const [x, z] = onFront(building, 0, 0);
      props.push(trim('awning', x, z, building.yaw, random));
    }
  }
}

function ivy({ buildings, random }, props) {
  for (const building of buildings) {
    if (!IVY_KINDS.has(building.kind) || random() > 0.3) continue;
    const side = random() < 0.5 ? -1 : 1;
    const front = [Math.sin(building.yaw), Math.cos(building.yaw)];
    const across = [front[1], -front[0]];
    const reach = (building.width / 2 - WALL_INSET) * side;
    const slide = (random() - 0.5) * Math.max(0, building.depth - 5);
    // The patch's own front faces out of the side wall it grows on.
    props.push(trim('ivyPatch', building.x + across[0] * reach + front[0] * slide, building.z + across[1] * reach + front[1] * slide,
      building.yaw + side * Math.PI / 2, random));
  }
}

/** A flight of steps against the inner face of some wall lengths, up to the wall-walk. */
function wallStairs({ buildings, occupancy, random }, props) {
  const length = WALL_STAIR.height / WALL_STAIR.rise * WALL_STAIR.run;
  const houses = buildings.filter(({ kind }) => !MASONRY_KINDS.has(kind))
    .map((building) => rect(building.x, building.z, building.width, building.depth, building.yaw));
  buildings.filter(({ kind }) => kind === 'wall').forEach((wall, index) => {
    if (index % STAIR_EVERY !== 2) return;
    const normal = [Math.sin(wall.yaw), Math.cos(wall.yaw)];
    // Whichever face of the wall looks toward the middle of the town.
    const inward = normal[0] * wall.x + normal[1] * wall.z > 0 ? -1 : 1;
    const offset = 1.1 + WALL_STAIR.width / 2 + 0.05;
    const x = wall.x + normal[0] * offset * inward;
    const z = wall.z + normal[1] * offset * inward;
    const box = rect(x, z, length, WALL_STAIR.width, wall.yaw);
    // Not `occupancy.fits`: the wall's own reserved strip is what a stair stands
    // in. It only has to keep off the water and off the houses.
    if (!occupancy.isBuildable(x, z) || houses.some((house) => rectsOverlap(box, house, 0.3))) return;
    props.push(trim('wallStair', x, z, wall.yaw, random));
  });
}

/** Sheep in some fields, hens scratching by the farmsteads. */
function livestock({ buildings, fields, random }, props) {
  for (const field of fields) {
    if (random() > 0.5) continue;
    const flock = 3 + Math.floor(random() * 5);
    const sin = Math.sin(field.yaw);
    const cos = Math.cos(field.yaw);
    for (let index = 0; index < flock; index += 1) {
      const localX = (random() - 0.5) * (field.width - 4);
      const localZ = (random() - 0.5) * (field.depth - 4);
      props.push(trim('sheep', field.x + cos * localX + sin * localZ, field.z - sin * localX + cos * localZ, random() * Math.PI * 2, random));
    }
  }
  for (const building of buildings) {
    if (building.kind !== 'farmhouse' && building.kind !== 'barn') continue;
    const hens = 2 + Math.floor(random() * 3);
    for (let index = 0; index < hens; index += 1) {
      const [x, z] = onFront(building, (random() - 0.5) * building.width, 1.4 + random() * 2.2);
      props.push(trim('hen', x, z, random() * Math.PI * 2, random));
    }
  }
}

/** Every piece of trim of one settlement, as props. */
export function planTrim(context) {
  const props = [];
  shopFronts(context, props);
  ivy(context, props);
  wallStairs(context, props);
  livestock(context, props);
  return props;
}
