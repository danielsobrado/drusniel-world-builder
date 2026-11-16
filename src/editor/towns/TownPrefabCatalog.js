/**
 * Which kit prefab or prop modules stand in for each thing a settlement plan asks for.
 *
 * Prefabs come from the Blender kit (tools/blender/medieval_town_kit, exported to
 * medieval_kit_prefabs.json) in regional families. A burg's family follows
 * its settlement style, which the planner derives from the burg's culture — so
 * one people's towns share a look and neighbouring cultures differ:
 *
 *   granite-slate         → Nordic  (clapboard, steep gables, finials, pent roofs)
 *   limestone-slate       → Tudor   (half-timber, slate gables, dormers)
 *   *-terracotta          → Med     (render, terracotta hip roofs, loggias, villas)
 *   *-thatch, goblin      → Goblin  (stilts, shanty walls, reed roofs)
 *
 * Realms whose people have a family of their own (Grukmar upland orcs, Frostgard,
 * Stonehold) name it in their scene recipe's `kitFamily`; it wins over the style,
 * which those realms share with Nordic towns. A family's own defences
 * (`<Family>_CityWall`, `<Family>_Gatehouse`) win over the shared ones.
 *
 * Pure data, no three.js.
 */

const FAMILY_BY_STYLE = Object.freeze({
  'granite-slate': 'Nordic',
  'limestone-slate': 'Tudor',
  'limestone-terracotta': 'Med',
  'sandstone-terracotta': 'Med',
  'timber-thatch': 'Goblin',
  'swamp-thatch': 'Goblin',
  'goblin': 'Goblin',
});

export const DEFAULT_FAMILY = 'Tudor';

/** Families only a recipe's kitFamily selects: no settlement style maps to them. */
const RECIPE_FAMILIES = new Set(['Orc', 'Frostgard', 'Stonehold']);

/** Prefab base names per planner building kind, indexed by the plan's variant. */
const BUILDING_BASES = Object.freeze({
  house: ['House_Small', 'House_Large', 'House_Cottage', 'House_Square', 'House_Long'],
  townhouse: ['Townhouse_Narrow', 'Townhouse_Wide', 'Townhouse_Tall', 'Library'],
  shop: ['Shop_Large', 'Shop_Small', 'Apothecary'],
  tavern: ['Tavern', 'Tavern_Large'],
  smithy: ['Smithy'],
  bakery: ['Bakery'],
  apothecary: ['Apothecary'],
  warehouse: ['Warehouse'],
  chapel: ['Chapel'],
  farmhouse: ['Farmhouse', 'Farmhouse_Small'],
  barn: ['Barn'],
  keep: ['Keep', 'Guardhouse'],
  hall: ['Manor', 'Guildhall'],
  // The kit has no arcaded hall; its guildhall stands in for the market hall.
  markethall: ['Guildhall'],
  guildhall: ['Guildhall'],
  guardhouse: ['Guardhouse'],
  library: ['Library'],
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
  fountain: [[['Fountain', 0, 0, 0, 0]], [['Town_Cross', 0, 0, 0, 0]], [['Statue_Plinth', 0, 0, 0, 0]]],
  stall: [
    [['Market_Stall_Cream', 0, 0, 0, 0], ['Barrel', 1.5, 0.5, 0, 0]],
    [['Market_Stall_Blue', 0, 0, 0, 0], ['Crate', -1.5, 0.3, 0.3, 0]],
    [['Market_Stall_Red', 0, 0, 0, 0]],
    [['Alchemist_Stall', 0, 0, 0, 0]],
  ],
  lantern: [[['Lamp_Post', 0, 0, 0, 0]], [['Lamp_Post_Banner', 0, 0, 0, 0]]],
  planter: [[['Flower_Box', 0, 0, 0, 0]]],
  bench: [[['Bench', 0, 0, 0, 0]]],
  cart: [[['Cart', 0, 0, 0, 0]]],
  barrels: [
    [['Barrel', -0.35, 0, 0, 0], ['Barrel', 0.35, 0.1, 0.6, 0], ['Barrel', 0, -0.55, 1.1, 0]],
    [['Crate', 0, 0, 0, 0], ['Crate', 0.05, 0.02, 0.4, 0.7]],
    [['Cargo_Pile', 0, 0, 0, 0]],
  ],
  fence: [[['Fence_Wood', -2, 0, 0, 0], ['Fence_Wood', 0, 0, 0, 0]]],
  shrine: [[['Wayside_Shrine', 0, 0, 0, 0]], [['Town_Cross', 0, 0, 0, 0]]],
  signpost: [[['Signpost', 0, 0, 0, 0]], [['Notice_Board', 0, 0, 0, 0]]],
  notice_board: [[['Notice_Board', 0, 0, 0, 0]]],
  brazier: [[['Brazier', 0, 0, 0, 0]]],
  trough: [[['Horse_Trough', 0, 0, 0, 0]]],
  grindstone: [[['Grindstone', 0, 0, 0, 0]]],
  cargo: [[['Cargo_Pile', 0, 0, 0, 0]]],
  bollards: [[['Bollards', 0, 0, 0, 0]]],
  woodpile: [[['Woodpile', 0, 0, 0, 0]]],
  bush: [[['Bush', 0, 0, 0, 0]], [['Bush', 0, 0, 0.8, 0], ['Bush', 0.6, 0.3, 2, 0]]],
  cauldron: [[['Cauldron_Fire', 0, 0, 0, 0]]],
  drying_rack: [[['Drying_Rack', 0, 0, 0, 0]]],
  baskets: [[['Basket_Cluster', 0, 0, 0, 0]]],
  torch_pole: [[['Torch_Pole', 0, 0, 0, 0]]],
  totem: [[['Goblin_Totem', 0, 0, 0, 0]]],
  barricade: [[['Spike_Barricade', 0, 0, 0, 0]]],
  skiff: [[['Goblin_Skiff', 0, 0, 0, 0]]],
  swamp_tree: [[['Swamp_Tree', 0, 0, 0, 0]]],
  // Frontier and mountain dressing (TownDressing REGIONAL_DRESSING).
  war_banner: [[['War_Banner', 0, 0, 0, 0]]],
  fire_post: [[['Fire_Post', 0, 0, 0, 0]]],
  brazier_pillar: [[['Brazier_Pillar', 0, 0, 0, 0]]],
  ore_crane: [[['Ore_Crane', 0, 0, 0, 0]]],
  boulders: [[['Boulder_Cluster', 0, 0, 0, 0]]],
  pine: [[['Tree_Pine', 0, 0, 0, 0]], [['Tree_Pine_Tall', 0, 0, 0, 0]]],
  tree: [[['Tree_Oak', 0, 0, 0, 0]], [['Tree_Pine', 0, 0, 0, 0]]],
  stonehold_ledge: [
    [['Stonehold_Ledge_Small', 0, 0, 0, 0]],
    [['Stonehold_Ledge_Large', 0, 0, 0, 0]],
    [['Stonehold_Twin_Outcrop', 0, 0, 0, 0]],
  ],
  stonehold_crater: [
    [['Stonehold_Vent_Crater', 0, 0, 0, 0]],
    [['Stonehold_Caldera_Basin', 0, 0, 0, 0]],
  ],
  stonehold_shrine: [
    [['Stonehold_Fang_Shrine', 0, 0, 0, 0]],
    [['Stonehold_Cavern_Maw', 0, 0, 0, 0]],
    [['Stonehold_Horned_Sanctum', 0, 0, 0, 0]],
  ],
  street_arch: [
    [['Street_Arch_Stone', 0, 0, 0, 0]],
    [['Street_Arch_Timber', 0, 0, 0, 0]],
    [['Street_Arch_Granite', 0, 0, 0, 0]],
    [['Street_Bunting', 0, 0, 0, 0]],
  ],
  tavern_tables: [[['Tavern_Table_Set', 0, 0, 0, 0]]],
  alchemist_stall: [[['Alchemist_Stall', 0, 0, 0, 0]]],
  armorer_stand: [[['Armorer_Stand', 0, 0, 0, 0]]],
  bake_oven: [[['Bake_Oven_Outdoor', 0, 0, 0, 0]]],
  guard_post: [[['Guard_Post', 0, 0, 0, 0]]],
  stocks: [[['Pillory_Stocks', 0, 0, 0, 0]]],
  statue: [[['Statue_Plinth', 0, 0, 0, 0]]],
  mine_cart: [[['Mine_Cart_Track', 0, 0, 0, 0]]],
  smelter_stack: [[['Smelter_Stack', 0, 0, 0, 0]]],
  ward_pillar: [[['Stonehold_Ward_Pillar', 0, 0, 0, 0]]],
  supply_sled: [[['Winter_Supply_Sled', 0, 0, 0, 0]]],
  mine_vent_stack: [[['Mine_Vent_Stack', 0, 0, 0, 0]]],
  tudor_market_pavilion: [[['Tudor_Market_Pavilion', 0, 0, 0, 0]]],
  tudor_dovecote_post: [[['Tudor_Dovecote_Post', 0, 0, 0, 0]]],
  tudor_flower_trellis_arch: [[['Tudor_Flower_Trellis_Arch', 0, 0, 0, 0]]],
  tudor_watch_lantern_gallows: [[['Tudor_Watch_Lantern_Gallows', 0, 0, 0, 0]]],
  tudor_guild_display_cart: [[['Tudor_Guild_Display_Cart', 0, 0, 0, 0]]],
  nordic_dragon_totem_post: [[['Nordic_Dragon_Totem_Post', 0, 0, 0, 0]]],
  nordic_brewery_cask_rack: [[['Nordic_Brewery_Cask_Rack', 0, 0, 0, 0]]],
  nordic_mead_hall_brazier: [[['Nordic_Mead_Hall_Brazier', 0, 0, 0, 0]]],
  nordic_furs_tanning_frame: [[['Nordic_Furs_Tanning_Frame', 0, 0, 0, 0]]],
  nordic_skiff_drydock_hull: [[['Nordic_Skiff_Drydock_Hull', 0, 0, 0, 0]]],
  med_amphora_terrace_stand: [[['Med_Amphora_Terrace_Stand', 0, 0, 0, 0]]],
  med_cypress_urn_planter: [[['Med_Cypress_Urn_Planter', 0, 0, 0, 0]]],
  med_sun_arbor_pergola: [[['Med_Sun_Arbor_Pergola', 0, 0, 0, 0]]],
  med_marble_lion_fountain: [[['Med_Marble_Lion_Fountain', 0, 0, 0, 0]]],
  med_merchant_scale_counter: [[['Med_Merchant_Scale_Counter', 0, 0, 0, 0]]],
  goblin_scrap_still_boiler: [[['Goblin_Scrap_Still_Boiler', 0, 0, 0, 0]]],
  goblin_cage_spike_gibbet: [[['Goblin_Cage_Spike_Gibbet', 0, 0, 0, 0]]],
  goblin_salvage_trophy_totem: [[['Goblin_Salvage_Trophy_Totem', 0, 0, 0, 0]]],
  goblin_bog_mushroom_coop: [[['Goblin_Bog_Mushroom_Coop', 0, 0, 0, 0]]],
  goblin_tinker_scrap_cart: [[['Goblin_Tinker_Scrap_Cart', 0, 0, 0, 0]]],
  orc_warchief_drum_pavilion: [[['Orc_Warchief_Drum_Pavilion', 0, 0, 0, 0]]],
  orc_bone_spike_barricade: [[['Orc_Bone_Spike_Barricade', 0, 0, 0, 0]]],
  orc_forge_quench_anvil_rig: [[['Orc_Forge_Quench_Anvil_Rig', 0, 0, 0, 0]]],
  orc_hide_rack_trophy_frame: [[['Orc_Hide_Rack_Trophy_Frame', 0, 0, 0, 0]]],
  orc_charred_idol_pillar: [[['Orc_Charred_Idol_Pillar', 0, 0, 0, 0]]],
  frostgard_ice_saw_rack: [[['Frostgard_Ice_Saw_Rack', 0, 0, 0, 0]]],
  frostgard_hearth_kettle_shelter: [[['Frostgard_Hearth_Kettle_Shelter', 0, 0, 0, 0]]],
  frostgard_runic_lantern_post: [[['Frostgard_Runic_Lantern_Post', 0, 0, 0, 0]]],
  frostgard_wolf_pelt_sled: [[['Frostgard_Wolf_Pelt_Sled', 0, 0, 0, 0]]],
  frostgard_rime_shrine_cairn: [[['Frostgard_Rime_Shrine_Cairn', 0, 0, 0, 0]]],
  dwarf_steam_exhaust_monument: [[['Stonehold_Steam_Exhaust_Monument', 0, 0, 0, 0]]],
  dwarf_rune_forge_pedestal: [[['Stonehold_Rune_Forge_Pedestal', 0, 0, 0, 0]]],
  dwarf_aqueduct_spout: [[['Stonehold_Aqueduct_Spout', 0, 0, 0, 0]]],
  dwarf_ore_classifier_chute: [[['Stonehold_Ore_Classifier_Chute', 0, 0, 0, 0]]],
  dwarf_ancestral_stele: [[['Stonehold_Ancestral_Stele', 0, 0, 0, 0]]],
  umbrakor_spider_silk_obelisk: [[['Umbrakor_Spider_Silk_Obelisk', 0, 0, 0, 0]]],
  umbrakor_bioluminescent_cap_shrine: [[['Umbrakor_Bioluminescent_Cap_Shrine', 0, 0, 0, 0]]],
  umbrakor_wrought_censer_gallows: [[['Umbrakor_Wrought_Censer_Gallows', 0, 0, 0, 0]]],
  umbrakor_night_market_canopy: [[['Umbrakor_Night_Market_Canopy', 0, 0, 0, 0]]],
  umbrakor_abyssal_waystone: [[['Umbrakor_Abyssal_Waystone', 0, 0, 0, 0]]],
  mountain_cliff: [[['Mountain_Cliff_Wall', 0, 0, 0, 0]]],
  mountain_gate: [[['Mountain_Gate_Massif', 0, 0, 0, 0]]],
  mountain_vault: [[['Mountain_Cavern_Vault', 0, 0, 0, 0]]],
});

/** Conservative world-space reservations for inhabited cliff landmarks (metres). */
export const STONEHOLD_LANDMARKS = Object.freeze([
  { kind: 'stonehold_ledge', variant: 0, w: 20, d: 22 },
  { kind: 'stonehold_ledge', variant: 1, w: 26, d: 25 },
  { kind: 'stonehold_ledge', variant: 2, w: 36, d: 26 },
  { kind: 'stonehold_crater', variant: 0, w: 21, d: 22 },
  { kind: 'stonehold_crater', variant: 1, w: 28, d: 28 },
  { kind: 'stonehold_shrine', variant: 0, w: 24, d: 25 },
  { kind: 'stonehold_shrine', variant: 1, w: 30, d: 30 },
  { kind: 'stonehold_shrine', variant: 2, w: 38, d: 35 },
].map(Object.freeze));

/** Kit modules that only ever stand as props, not the massifs a town is seen by. */
const PROP_MODULES = new Set(Object.entries(PROP_CLUSTERS)
  .filter(([kind]) => !kind.startsWith('mountain_') && !kind.startsWith('stonehold_'))
  .flatMap(([, variants]) => variants.flat().map(([module]) => module)));
PROP_MODULES.add('Wall_Lantern');

export function isTownProp(module) {
  return PROP_MODULES.has(module);
}

/** Kinds whose variant is only a look choice, so the town spreads them by salt. */
const SALTED_PROPS = new Set(['stall', 'lantern', 'shrine', 'signpost']);

/** Towns of this rank and up build a tiered fountain where the plan asks for a well. */
const FOUNTAIN_RANK = 2;

export function familyForStyle(styleKey) {
  return FAMILY_BY_STYLE[styleKey] ?? DEFAULT_FAMILY;
}

/** A town's family: its recipe's own family when it has one, else its style's. */
export function familyForProfile(profile, styleKey) {
  const kitFamily = profile?.hasRegionalIdentity ? profile.recipe?.architecture?.kitFamily : null;
  return RECIPE_FAMILIES.has(kitFamily) ? kitFamily : familyForStyle(styleKey);
}

/** Share of buildings that use a base's one-story-taller sibling when the kit has one. */
export const TALL_SHARE = 0.4;
const TALL_SUFFIX = '_Tall';

/**
 * Prefab name for a planned building, or null when the kit has nothing for it.
 * With a per-building `heightRoll` in [0, 1), roughly TALL_SHARE of buildings
 * whose prefab has a `_Tall` sibling (same footprint, one story more) use it.
 */
export function prefabNameFor(kind, variant, family, prefabs, heightRoll = 1) {
  const name = basePrefabFor(kind, variant, family, prefabs);
  const tall = name && `${name}${TALL_SUFFIX}`;
  return tall && heightRoll < TALL_SHARE && prefabs?.[tall] ? tall : name;
}

function basePrefabFor(kind, variant, family, prefabs) {
  if (DEFENCE_PREFABS[kind]) {
    const own = `${family}_${DEFENCE_PREFABS[kind]}`;
    return prefabs?.[own] ? own : DEFENCE_PREFABS[kind];
  }
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
