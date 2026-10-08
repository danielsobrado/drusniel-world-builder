/**
 * Which kit prefab or prop modules stand in for each thing a settlement plan asks for.
 *
 * Prefabs come from the Blender kit (tools/blender/medieval_town_kit, exported to
 * medieval_kit_prefabs.json) in three regional families. A burg's family follows
 * its settlement style, which the planner derives from the burg's culture — so
 * one people's towns share a look and neighbouring cultures differ:
 *
 *   granite-slate         → Nordic  (clapboard, steep gables, finials, pent roofs)
 *   limestone-slate       → Tudor   (half-timber, slate gables, dormers)
 *   *-terracotta          → Med     (render, terracotta hip roofs, loggias, villas)
 *
 * Pure data, no three.js.
 */

const FAMILY_BY_STYLE = Object.freeze({
  'granite-slate': 'Nordic',
  'limestone-slate': 'Tudor',
  'limestone-terracotta': 'Med',
  'sandstone-terracotta': 'Med',
});

export const DEFAULT_FAMILY = 'Tudor';

/** Prefab base names per planner building kind, indexed by the plan's variant. */
const BUILDING_BASES = Object.freeze({
  house: ['House_Small', 'House_Large', 'House_Cottage', 'House_Square', 'House_Long'],
  townhouse: ['Townhouse_Narrow', 'Townhouse_Wide', 'Townhouse_Tall'],
  shop: ['Shop_Large', 'Shop_Small'],
  tavern: ['Tavern', 'Tavern_Large'],
  smithy: ['Smithy'],
  bakery: ['Bakery'],
  warehouse: ['Warehouse'],
  chapel: ['Chapel'],
  farmhouse: ['Farmhouse', 'Farmhouse_Small'],
  barn: ['Barn'],
  keep: ['Keep'],
  hall: ['Manor'],
});

/** Shared, family-less pieces. */
const DEFENCE_PREFABS = Object.freeze({ wall: 'CityWall', gatehouse: 'Gatehouse', tower: 'RoundTower' });

/** Family-specific replacements for a base. */
const FAMILY_OVERRIDES = Object.freeze({ Med: Object.freeze({ Manor: 'Med_Villa' }) });

/**
 * Prop clusters: [module, dx, dz, yaw, dy] in the prop's local frame (front +Z).
 * Variants index into the outer list.
 */
const PROP_CLUSTERS = Object.freeze({
  well: [[['Well', 0, 0, 0, 0]]],
  fountain: [[['Fountain', 0, 0, 0, 0]]],
  stall: [
    [['Market_Stall_Cream', 0, 0, 0, 0], ['Barrel', 1.5, 0.5, 0, 0]],
    [['Market_Stall_Blue', 0, 0, 0, 0], ['Crate', -1.5, 0.3, 0.3, 0]],
    [['Market_Stall_Red', 0, 0, 0, 0]],
  ],
  lantern: [[['Lamp_Post', 0, 0, 0, 0]], [['Lamp_Post_Banner', 0, 0, 0, 0]]],
  planter: [[['Flower_Box', 0, 0, 0, 0]]],
  bench: [[['Bench', 0, 0, 0, 0]]],
  cart: [[['Cart', 0, 0, 0, 0]]],
  barrels: [
    [['Barrel', -0.35, 0, 0, 0], ['Barrel', 0.35, 0.1, 0.6, 0], ['Barrel', 0, -0.55, 1.1, 0]],
    [['Crate', 0, 0, 0, 0], ['Crate', 0.05, 0.02, 0.4, 0.7]],
  ],
  fence: [[['Fence_Wood', -2, 0, 0, 0], ['Fence_Wood', 0, 0, 0, 0]]],
  shrine: [[['Bush', 0, 0, 0, 0]], [['Flower_Box', 0, 0, 0, 0]]],
  woodpile: [[['Woodpile', 0, 0, 0, 0]]],
  bush: [[['Bush', 0, 0, 0, 0]], [['Bush', 0, 0, 0.8, 0], ['Bush', 0.6, 0.3, 2, 0]]],
});

/** Kinds whose variant is only a look choice, so the town spreads them by salt. */
const SALTED_PROPS = new Set(['stall', 'lantern']);

/** Towns of this rank and up build a tiered fountain where the plan asks for a well. */
const FOUNTAIN_RANK = 2;

export function familyForStyle(styleKey) {
  return FAMILY_BY_STYLE[styleKey] ?? DEFAULT_FAMILY;
}

/** Prefab name for a planned building, or null when the kit has nothing for it. */
export function prefabNameFor(kind, variant, family, prefabs) {
  if (DEFENCE_PREFABS[kind]) return DEFENCE_PREFABS[kind];
  const bases = BUILDING_BASES[kind];
  if (!bases) return null;
  const base = bases[Math.abs(variant | 0) % bases.length];
  const override = FAMILY_OVERRIDES[family]?.[base];
  const candidates = [override, `${family}_${base}`, `${DEFAULT_FAMILY}_${base}`].filter(Boolean);
  return candidates.find((name) => !prefabs || prefabs[name]) ?? null;
}

/** Module cluster for a planned prop, or an empty list for props the kit skips. */
export function propClusterFor(kind, variant, salt = 0, rank = 0) {
  const clusters = PROP_CLUSTERS[kind === 'well' && rank >= FOUNTAIN_RANK ? 'fountain' : kind];
  if (!clusters) return [];
  const index = (variant | 0) + (SALTED_PROPS.has(kind) ? salt : 0);
  return clusters[Math.abs(index) % clusters.length];
}
