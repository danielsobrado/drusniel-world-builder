import { poolKey } from '../SettlementBuildingCatalog.js';
import { isStoneKind } from '../SettlementStones.js';

/**
 * A settlement plan as things to draw: every building and prop with its pooled
 * mesh and its pose in canonical world space.
 *
 * Plans are laid out in plan space (see SettlementGeometry), where +z is cell
 * z; canonical world z is its negative. A footprint's front, (sin yaw, cos yaw)
 * in plan space, is therefore (sin yaw, −cos yaw) in the world — a turn of
 * π − yaw about the vertical. Pure data, no three.
 */

/** Kinds drawn only from close by: street furniture a far tier would never show. */
const SMALL_KINDS = new Set(['lantern', 'planter', 'shrine', 'signpost', 'bench', 'cart', 'barrels', 'fence', 'bollards', 'stall', 'well']);

export function isSmallKind(kind) {
  return SMALL_KINDS.has(kind) || isStoneKind(kind);
}

export function planToWorld(settlement, tileSize, x, z) {
  return { x: settlement.cellX * tileSize + x, z: -(settlement.cellZ * tileSize + z) };
}

/**
 * @param {object} settlement the burg (cellX, cellZ)
 * @param {object} plan its settlement plan
 * @param {number} tileSize metres per cell
 * @param {(x: number, z: number) => number} heightAt ground height at plan (x, z)
 * @returns {Array<{ key: string, kind: string, variant: number, small: boolean,
 *   x: number, y: number, z: number, rotationY: number, scale: number, seed: number }>}
 */
export function settlementPlacements(settlement, plan, tileSize, heightAt) {
  const styleKey = plan.profile.style.key;
  const place = (item, index, y, small) => {
    const world = planToWorld(settlement, tileSize, item.x, item.z);
    return {
      // Loose stone is pooled beside the workshop meshes, under the same style prefix.
      key: isStoneKind(item.kind) ? `${styleKey}|${item.kind}|${item.variant}` : poolKey(styleKey, item.kind, item.variant),
      kind: item.kind,
      variant: item.variant,
      small,
      x: world.x,
      y,
      z: world.z,
      rotationY: Math.PI - item.yaw,
      scale: item.scale ?? 1,
      // Stable per placement: it seeds the dither pattern of LOD fades.
      seed: ((Math.imul(settlement.id | 0, 9973) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 8) / 16777216,
    };
  };
  return [
    // A building stands on the pad the terrain was graded to.
    ...plan.buildings.map((building, index) => place(building, index, building.pad, false)),
    ...plan.props.map((prop, index) => place(prop, plan.buildings.length + index, heightAt(prop.x, prop.z), isSmallKind(prop.kind))),
  ];
}
