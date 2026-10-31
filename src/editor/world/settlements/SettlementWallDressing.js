import { trimPiece } from './SettlementTrim.js';

/** Metres the wall's outer face stands from its centre line. */
const WALL_FACE = 0.9;
/** Most metres from the middle of a length that a piece may sit, keeping off the joints and towers. */
const REACH = 4.4;

/**
 * What breaks up a long wall on its outer face: buttresses or shoring, patches
 * of newer stone, and drain spouts with their stain, each at the rhythm its
 * people's profile gives. Fixed by a length's place in the ring, like the
 * overgrown variants, so a wall keeps its order while the jitter stays seeded.
 */
export function planWallDressing({ defences, wall, random }) {
  const props = [];
  defences.filter(({ kind }) => kind === 'wall').forEach((length, index) => {
    const normal = [Math.sin(length.yaw), Math.cos(length.yaw)];
    const outward = normal[0] * length.x + normal[1] * length.z > 0 ? 1 : -1;
    const yaw = outward > 0 ? length.yaw : length.yaw + Math.PI;
    const put = (kind) => {
      const along = (random() * 2 - 1) * REACH;
      const x = length.x + normal[0] * outward * WALL_FACE + Math.cos(length.yaw) * along;
      const z = length.z + normal[1] * outward * WALL_FACE - Math.sin(length.yaw) * along;
      props.push(trimPiece(kind, x, z, yaw, random));
    };
    if (index % wall.buttressEvery === 0) put(wall.buttressKind);
    if (index % wall.repairEvery === 1) put('wallRepair');
    if (index % wall.spoutEvery === 3) put('wallSpout');
  });
  return props;
}
