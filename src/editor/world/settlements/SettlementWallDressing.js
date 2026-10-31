import { rect } from './SettlementGeometry.js';
import { looseStone } from './SettlementStones.js';
import { trimPiece } from './SettlementTrim.js';

/** Metres the wall's outer face stands from its centre line. */
const WALL_FACE = 0.9;
/** Most metres from the middle of a length that a piece may sit, keeping off the joints and towers. */
const REACH = 4.4;
/** Loose stones lying at the foot of each length, and how far out from its face they roll. */
const FOOT_STONES = 3;
const FOOT_REACH = 2.2;
/** Every this many lengths a town stacks stores against its wall. */
const STORES_EVERY = 5;
/** Metres out from the centre line that stores stand: just past the wall's own footprint. */
const STORES_OUT = 4.2;

/**
 * What breaks up a long wall on its outer face: buttresses or shoring, patches
 * of newer stone, and drain spouts with their stain, each at the rhythm its
 * people's profile gives. Fixed by a length's place in the ring, like the
 * overgrown variants, so a wall keeps its order while the jitter stays seeded.
 * Its foot gets what falls from it and what a town has no room for inside.
 */
export function planWallDressing({ defences, wall, occupancy, random }) {
  const props = [];
  defences.filter(({ kind }) => kind === 'wall').forEach((length, index) => {
    const normal = [Math.sin(length.yaw), Math.cos(length.yaw)];
    const outward = normal[0] * length.x + normal[1] * length.z > 0 ? 1 : -1;
    const yaw = outward > 0 ? length.yaw : length.yaw + Math.PI;
    const spot = (out) => {
      const along = (random() * 2 - 1) * REACH;
      return [
        length.x + normal[0] * outward * out + Math.cos(length.yaw) * along,
        length.z + normal[1] * outward * out - Math.sin(length.yaw) * along,
      ];
    };
    const put = (kind) => props.push(trimPiece(kind, ...spot(WALL_FACE), yaw, random));
    if (index % wall.buttressEvery === 0) put(wall.buttressKind);
    if (index % wall.repairEvery === 1) put('wallRepair');
    if (index % wall.spoutEvery === 3) put('wallSpout');
    for (let stone = 0; stone < FOOT_STONES; stone += 1) {
      // Inside the wall's own footprint, which is what keeps it off any street.
      const [x, z] = spot(WALL_FACE + random() * FOOT_REACH);
      props.push(looseStone(random() < 0.15 ? 'boulder' : 'fieldstone', x, z, random, 0.4));
    }
    if (index % STORES_EVERY === 2) {
      const [x, z] = spot(STORES_OUT);
      if (occupancy.fits(rect(x, z, 2.4, 2.4, 0), { clearance: 0.2, streetClearance: 0.8 })) {
        props.push({ kind: 'barrels', variant: index % 2, x, z, yaw: yaw + random() * 0.5 });
      }
    }
  });
  return props;
}
