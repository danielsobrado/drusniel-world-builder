/**
 * Canonical 138-asset registry data (`docs/asset-bible/proposed-config/asset-candidates.proposed.yaml`).
 *
 * Tracks 108 regional assets (9 regions × 12 assets [6 P0 + 6 P1]) and 30 shared
 * environmental overlay assets (6 overlays × 5 assets), with explicit runtime
 * fallback mappings to procedural settlement kinds (`SETTLEMENT_BUILDINGS`,
 * `SETTLEMENT_TRIM`, `SETTLEMENT_STONES`) and kit prefabs/props (`TownPrefabCatalog`).
 *
 * Pure data, frozen, safe in workers and Node.
 */

const VIEWS = Object.freeze(['hero', 'front', 'left', 'rear', 'top', 'detail']);

const LORE_SOURCES = Object.freeze({
  contian: 'https://www.drusniel.com/knowledge-and-power-the-rise-of-the-contian-league/',
  elenoria: 'https://www.drusniel.com/guardians-of-harmony-elenorias-sacred-duty/',
  frostgard: 'https://www.drusniel.com/unyielding-spirit-of-frostgards-frozen-heart/',
  grukmar: 'https://www.drusniel.com/from-ashes-to-empire-the-rise-of-grukmar/',
  lumeshire: 'https://www.drusniel.com/the-resilient-defense-of-the-lumeshirean-divine-empire/',
  stonehold: 'https://www.drusniel.com/forge-and-fire-the-mountain-kingdom-of-stoneholds-stand-against-chaos/',
  umbrakor: 'https://www.drusniel.com/the-umbrakor-dominions-pact-with-darkness/',
  wyrmreach: 'https://www.drusniel.com/the-mysteries-of-the-wyrmreach-dominion/',
  zuraldi: 'https://www.drusniel.com/the-zuraldarr/',
});

const REGION_CULTURES = Object.freeze({
  contian: Object.freeze(['contian']),
  elenoria: Object.freeze(['elenori']),
  frostgard: Object.freeze(['norths', 'jotunn']),
  grukmar: Object.freeze(['goblin-peoples', 'orc-peoples', 'rakhnid-broods']),
  lumeshire: Object.freeze(['lumish']),
  stonehold: Object.freeze(['vondari']),
  umbrakor: Object.freeze(['umbra-kori']),
  wyrmreach: Object.freeze(['orc-peoples', 'goblin-peoples', 'jotunn', 'serpent-peoples', 'rakhnid-broods', 'draconic-remnant']),
  zuraldi: Object.freeze(['zuraldarr']),
});

function regionalAsset(regionDossier, slug, assetClass, priority, fallback, constraints = {}) {
  const id = `${regionDossier}/${slug}`;
  return Object.freeze({
    id,
    assetClass,
    priority,
    regionDossier,
    eligibleCultureSeeds: REGION_CULTURES[regionDossier],
    loreSource: LORE_SOURCES[regionDossier],
    promptFile: `regions/${regionDossier}.md`,
    referenceImages: Object.freeze(VIEWS.map((view) => `references/${id}/${view}.png`)),
    loreStatus: 'design-proposal',
    modelStatus: 'planned',
    fallback: Object.freeze(fallback),
    constraints: Object.freeze({
      requiresWaterAccess: Boolean(constraints.requiresWaterAccess || assetClass === 'coastal'),
      requiresWetland: Boolean(constraints.requiresWetland),
      requiresSlope: Boolean(constraints.requiresSlope),
      requiresForest: Boolean(constraints.requiresForest),
      requiresUnderground: Boolean(constraints.requiresUnderground),
      forbidsSky: Boolean(constraints.forbidsSky),
      requiresRuinContext: Boolean(constraints.requiresRuinContext || assetClass === 'ruin'),
    }),
  });
}

function overlayAsset(areaOverlay, slug, fallback, constraints = {}) {
  const id = `${areaOverlay}/${slug}`;
  return Object.freeze({
    id,
    assetClass: 'shared-environment',
    priority: 'P1',
    areaOverlay,
    promptFile: `areas/${areaOverlay}.md`,
    referenceImages: Object.freeze(VIEWS.map((view) => `references/${id}/${view}.png`)),
    loreStatus: 'design-proposal',
    modelStatus: 'planned',
    fallback: Object.freeze(fallback),
    constraints: Object.freeze({
      requiresWaterAccess: Boolean(constraints.requiresWaterAccess || areaOverlay === 'coast-harbor'),
      requiresWetland: Boolean(constraints.requiresWetland || areaOverlay === 'swamp-bog'),
      requiresSlope: Boolean(constraints.requiresSlope || areaOverlay === 'mountain-pass'),
      requiresForest: Boolean(constraints.requiresForest || areaOverlay === 'forest-canopy'),
      requiresUnderground: Boolean(constraints.requiresUnderground || areaOverlay === 'underground-cavern'),
      forbidsSky: Boolean(constraints.forbidsSky || areaOverlay === 'underground-cavern'),
      requiresRuinContext: Boolean(constraints.requiresRuinContext || areaOverlay === 'ruins-rift'),
    }),
  });
}

const bldg = (settlementKind, settlementVariant, kitPrefab, footprint = [10, 8, 6]) => ({
  kind: 'building',
  settlementKind,
  settlementVariant,
  kitPrefab,
  kitProp: null,
  footprint: Object.freeze(footprint),
});

const prop = (settlementKind, settlementVariant, kitProp, footprint = [2, 2, 2]) => ({
  kind: 'prop',
  settlementKind,
  settlementVariant,
  kitPrefab: null,
  kitProp,
  footprint: Object.freeze(footprint),
});

export const ASSET_CANDIDATE_LIST = Object.freeze([
  // --- CONTIAN (12: 6 P0, 6 P1) ---
  regionalAsset('contian', 'collegium-lecture-hall', 'civic', 'P0', bldg('hall', 0, 'Med_Guildhall', [14, 10, 8])),
  regionalAsset('contian', 'archive-rotunda', 'civic', 'P0', bldg('chapel', 0, 'Med_Library', [10, 10, 9])),
  regionalAsset('contian', 'guild-exchange-loggia', 'trade', 'P0', bldg('shop', 0, 'Med_Shop_Large', [12, 8, 7])),
  regionalAsset('contian', 'aqueduct-cistern-house', 'infrastructure', 'P0', bldg('warehouse', 0, 'Med_Warehouse', [10, 10, 8])),
  regionalAsset('contian', 'observatory-instrument-tower', 'civic', 'P0', bldg('tower', 0, 'RoundTower', [8, 8, 12])),
  regionalAsset('contian', 'customs-canal-gate', 'infrastructure', 'P0', bldg('gatehouse', 0, 'Gatehouse', [14, 8, 7]), { requiresWaterAccess: true }),
  regionalAsset('contian', 'scholar-courtyard-townhouse', 'residence', 'P1', bldg('townhouse', 1, 'Med_Villa', [12, 9, 8])),
  regionalAsset('contian', 'printing-bindery-workshop', 'industry', 'P1', bldg('shop', 1, 'Med_Apothecary', [9, 7, 6])),
  regionalAsset('contian', 'botanical-specimen-court', 'agriculture', 'P1', prop('planter', 0, 'planter', [4, 4, 2])),
  regionalAsset('contian', 'water-clock-kiosk', 'prop', 'P1', prop('well', 0, 'fountain', [3, 3, 3.5])),
  regionalAsset('contian', 'surveyor-obelisk', 'prop', 'P1', prop('shrine', 1, 'shrine', [2, 2, 3.5])),
  regionalAsset('contian', 'book-peddler-stall', 'prop', 'P1', prop('stall', 0, 'stall', [3.5, 2.5, 2.6])),

  // --- ELENORIA (12: 6 P0, 6 P1) ---
  regionalAsset('elenoria', 'bough-council-pavilion', 'civic', 'P0', bldg('hall', 0, 'Med_Guildhall', [14, 10, 7]), { requiresForest: true }),
  regionalAsset('elenoria', 'root-span-arch-bridge', 'infrastructure', 'P0', bldg('gatehouse', 0, 'Gatehouse', [12, 5, 4])),
  regionalAsset('elenoria', 'grove-harmony-sanctuary', 'sacred', 'P0', bldg('chapel', 0, 'Med_Chapel', [9, 12, 7]), { requiresForest: true }),
  regionalAsset('elenoria', 'canopy-warden-outpost', 'defense', 'P0', bldg('tower', 0, 'Med_Guardhouse', [8, 8, 9]), { requiresForest: true }),
  regionalAsset('elenoria', 'terraced-herb-distillery', 'industry', 'P0', bldg('bakery', 0, 'Med_Apothecary', [8, 6, 5])),
  regionalAsset('elenoria', 'living-wood-craft-hall', 'industry', 'P0', bldg('shop', 0, 'Med_Shop_Large', [10, 7, 6])),
  regionalAsset('elenoria', 'understory-cottage', 'residence', 'P1', bldg('house', 4, 'Med_House_Cottage', [9, 6, 5])),
  regionalAsset('elenoria', 'stream-weir-basin', 'infrastructure', 'P1', prop('well', 0, 'fountain', [3.4, 3.4, 2]), { requiresWaterAccess: true }),
  regionalAsset('elenoria', 'suspended-walkway-span', 'infrastructure', 'P1', prop('fence', 0, 'fence', [4, 1.6, 2]), { requiresForest: true }),
  regionalAsset('elenoria', 'seed-vault-shrine', 'sacred', 'P1', prop('shrine', 0, 'shrine', [2.2, 2.2, 2.8])),
  regionalAsset('elenoria', 'wayfinder-lantern-bough', 'prop', 'P1', prop('lantern', 0, 'lantern', [1.5, 1.5, 3])),
  regionalAsset('elenoria', 'silviculture-tending-bench', 'prop', 'P1', prop('bench', 0, 'bench', [2.4, 1.2, 1.5])),

  // --- FROSTGARD (12: 6 P0, 6 P1) ---
  regionalAsset('frostgard', 'hearth-longhall', 'civic', 'P0', bldg('hall', 0, 'Nordic_Manor', [16, 9, 7])),
  regionalAsset('frostgard', 'jotunn-stone-moot-ring', 'sacred', 'P0', bldg('chapel', 0, 'Nordic_Chapel', [12, 12, 6])),
  regionalAsset('frostgard', 'ice-harbor-boathouse', 'coastal', 'P0', bldg('warehouse', 0, 'Nordic_Warehouse', [9, 12, 6]), { requiresWaterAccess: true }),
  regionalAsset('frostgard', 'windbreak-beacon-tower', 'defense', 'P0', bldg('tower', 0, 'Nordic_Guardhouse', [8, 8, 10])),
  regionalAsset('frostgard', 'winter-store-pit-house', 'agriculture', 'P0', bldg('barn', 0, 'Nordic_Barn', [8, 10, 4.5])),
  regionalAsset('frostgard', 'turf-roofed-smithy', 'industry', 'P0', bldg('smithy', 0, 'Nordic_Smithy', [9, 7, 4.5])),
  regionalAsset('frostgard', 'earth-bermed-homestead', 'residence', 'P1', bldg('farmhouse', 0, 'Nordic_Farmhouse', [12, 7, 4])),
  regionalAsset('frostgard', 'whale-rib-drying-stage', 'industry', 'P1', prop('barrels', 1, 'drying_rack', [2.6, 1.4, 2.4])),
  regionalAsset('frostgard', 'snow-trench-palisade', 'defense', 'P1', prop('fence', 0, 'barricade', [4, 1.2, 2.2])),
  regionalAsset('frostgard', 'sled-dog-yard', 'agriculture', 'P1', prop('cart', 0, 'trough', [3, 2, 1.5])),
  regionalAsset('frostgard', 'carved-saga-runestone', 'prop', 'P1', prop('shrine', 1, 'shrine', [1.8, 1.8, 3])),
  regionalAsset('frostgard', 'blubber-try-pot-hearth', 'prop', 'P1', prop('well', 0, 'cauldron', [2, 2, 1.8])),

  // --- GRUKMAR (12: 6 P0, 6 P1) ---
  regionalAsset('grukmar', 'bog-stilt-dwelling', 'residence', 'P0', bldg('house', 2, 'Goblin_House_Small', [8, 7, 6]), { requiresWetland: true }),
  regionalAsset('grukmar', 'clan-assembly-hall', 'civic', 'P0', bldg('hall', 0, 'Goblin_Manor', [14, 10, 7.5])),
  regionalAsset('grukmar', 'raised-marsh-boardwalk', 'infrastructure', 'P0', prop('fence', 0, 'fence', [4, 2, 1.2]), { requiresWetland: true }),
  regionalAsset('grukmar', 'wetland-barter-market', 'trade', 'P0', bldg('shop', 0, 'Goblin_Shop_Large', [10, 8, 6])),
  regionalAsset('grukmar', 'salvage-smithy', 'industry', 'P0', bldg('smithy', 0, 'Goblin_Smithy', [9, 7, 5])),
  regionalAsset('grukmar', 'ridge-palisade-gate', 'defense', 'P0', bldg('gatehouse', 0, 'Goblin_Guardhouse', [10, 6, 7])),
  regionalAsset('grukmar', 'marsh-watch-tower', 'defense', 'P1', bldg('tower', 0, 'Goblin_Tower', [6, 6, 9])),
  regionalAsset('grukmar', 'peat-kiln-shed', 'industry', 'P1', bldg('bakery', 0, 'Goblin_Bakery', [7, 6, 4.5])),
  regionalAsset('grukmar', 'goblin-boat-landing', 'coastal', 'P1', prop('cart', 0, 'skiff', [3.2, 2, 1.2]), { requiresWaterAccess: true }),
  regionalAsset('grukmar', 'orc-haul-wagon', 'prop', 'P1', prop('cart', 0, 'cart', [2.4, 4.2, 2.2])),
  regionalAsset('grukmar', 'reed-drying-frame', 'prop', 'P1', prop('barrels', 0, 'drying_rack', [2.4, 1.2, 2.2])),
  regionalAsset('grukmar', 'treaty-totem-post', 'prop', 'P1', prop('shrine', 0, 'totem', [1.4, 1.4, 3.2])),

  // --- LUMESHIRE (12: 6 P0, 6 P1) ---
  regionalAsset('lumeshire', 'imperial-registry-hall', 'civic', 'P0', bldg('hall', 0, 'Tudor_Guildhall', [15, 10, 8.5])),
  regionalAsset('lumeshire', 'parish-church', 'sacred', 'P0', bldg('chapel', 0, 'Tudor_Chapel', [8, 12, 8])),
  regionalAsset('lumeshire', 'granary', 'agriculture', 'P0', bldg('warehouse', 0, 'Tudor_Warehouse', [9, 11, 8.5])),
  regionalAsset('lumeshire', 'fortified-market-hall', 'trade', 'P0', bldg('shop', 0, 'Tudor_Shop_Large', [11, 8, 7])),
  regionalAsset('lumeshire', 'border-watchtower', 'defense', 'P0', bldg('tower', 0, 'RoundTower', [7, 7, 10])),
  regionalAsset('lumeshire', 'toll-bridge-gate', 'infrastructure', 'P0', bldg('gatehouse', 0, 'Gatehouse', [12, 6, 7])),
  regionalAsset('lumeshire', 'clerks-rowhouse', 'residence', 'P1', bldg('townhouse', 0, 'Tudor_Townhouse_Narrow', [6, 10, 9])),
  regionalAsset('lumeshire', 'courtyard-tenement', 'residence', 'P1', bldg('townhouse', 1, 'Tudor_Townhouse_Wide', [11, 8, 9.5])),
  regionalAsset('lumeshire', 'wagon-grain-stall', 'prop', 'P1', prop('stall', 0, 'stall', [3.8, 2.8, 2.6])),
  regionalAsset('lumeshire', 'road-mile-marker', 'prop', 'P1', prop('signpost', 0, 'signpost', [1.4, 1.4, 2.4])),
  regionalAsset('lumeshire', 'barracks-supply-shed', 'military', 'P1', bldg('barn', 0, 'Tudor_Guardhouse', [8, 9, 5.5])),
  regionalAsset('lumeshire', 'communal-bake-oven', 'industry', 'P1', bldg('bakery', 0, 'Tudor_Bakery', [8, 6, 4.5])),

  // --- STONEHOLD (12: 6 P0, 6 P1) ---
  regionalAsset('stonehold', 'fortress-mountain-gate', 'defense', 'P0', bldg('gatehouse', 0, 'Gatehouse', [14, 8, 9])),
  regionalAsset('stonehold', 'forgeheart-workshop', 'industry', 'P0', bldg('smithy', 0, 'Nordic_Smithy', [10, 8, 6])),
  regionalAsset('stonehold', 'smelter-tower', 'industry', 'P0', bldg('tower', 0, 'RoundTower', [7, 7, 11])),
  regionalAsset('stonehold', 'ore-lift-headframe', 'industry', 'P0', bldg('warehouse', 0, 'Nordic_Warehouse', [9, 10, 10])),
  regionalAsset('stonehold', 'ore-cart-track', 'infrastructure', 'P0', prop('bollards', 0, 'cargo', [4.5, 1.6, 1.2])),
  regionalAsset('stonehold', 'vault-council-hall', 'civic', 'P0', bldg('keep', 0, 'Nordic_Guildhall', [14, 12, 10])),
  regionalAsset('stonehold', 'terraced-stone-worker-home', 'residence', 'P1', bldg('townhouse', 2, 'Nordic_Townhouse_Narrow', [7, 8, 7.5])),
  regionalAsset('stonehold', 'basalt-viaduct', 'infrastructure', 'P1', bldg('wall', 0, 'CityWall', [12, 3, 6])),
  regionalAsset('stonehold', 'sealed-shaft-barricade', 'defense', 'P1', prop('bollards', 0, 'barricade', [4.2, 1.5, 2.2])),
  regionalAsset('stonehold', 'mine-ventilation-stack', 'industry', 'P1', prop('well', 0, 'brazier', [2.8, 2.8, 4])),
  regionalAsset('stonehold', 'ore-assay-bench', 'prop', 'P1', prop('stall', 1, 'grindstone', [2.8, 1.8, 1.6])),
  regionalAsset('stonehold', 'stonehold-ward-block', 'prop', 'P1', prop('quarryBlock', 0, 'bollards', [1.4, 1.4, 1.6])),

  // --- UMBRA'KOR (12: 6 P0, 6 P1) ---
  regionalAsset('umbrakor', 'cliff-house-compound', 'residence', 'P0', bldg('keep', 0, 'Med_Villa', [14, 12, 11])),
  regionalAsset('umbrakor', 'void-arch-bridge', 'infrastructure', 'P0', bldg('wall', 0, 'CityWall', [12, 3, 6])),
  regionalAsset('umbrakor', 'vertical-terrace-block', 'residence', 'P0', bldg('townhouse', 0, 'Med_Townhouse_Tall', [7, 9, 10])),
  regionalAsset('umbrakor', 'fungus-cultivation-hall', 'agriculture', 'P0', bldg('barn', 0, 'Med_Warehouse', [9, 11, 6])),
  regionalAsset('umbrakor', 'house-market-balcony', 'trade', 'P0', bldg('shop', 0, 'Med_Shop_Large', [10, 7, 7])),
  regionalAsset('umbrakor', 'depth-warden-gate', 'defense', 'P0', bldg('gatehouse', 0, 'Gatehouse', [12, 7, 8])),
  regionalAsset('umbrakor', 'venemora-temple-hall', 'sacred', 'P1', bldg('chapel', 0, 'Med_Chapel', [9, 12, 8])),
  regionalAsset('umbrakor', 'rift-seal-checkpoint', 'defense', 'P1', bldg('tower', 0, 'Med_Guardhouse', [7, 7, 8])),
  regionalAsset('umbrakor', 'cavern-air-shaft', 'infrastructure', 'P1', prop('well', 0, 'brazier', [3, 3, 3.5])),
  regionalAsset('umbrakor', 'pale-wayfinder', 'prop', 'P1', prop('lantern', 1, 'lantern', [1.4, 1.4, 2.6])),
  regionalAsset('umbrakor', 'underground-river-dock', 'coastal', 'P1', bldg('warehouse', 0, 'Med_Warehouse', [8, 10, 6]), { requiresWaterAccess: true }),
  regionalAsset('umbrakor', 'house-archive-vault', 'civic', 'P1', bldg('hall', 0, 'Med_Library', [11, 9, 8])),

  // --- WYRMREACH (12: 6 P0, 6 P1) ---
  regionalAsset('wyrmreach', 'storm-coast-waystation', 'residence', 'P0', bldg('tavern', 0, 'Nordic_Tavern', [9, 7, 5])),
  regionalAsset('wyrmreach', 'frontier-cargo-breakwater', 'coastal', 'P0', bldg('warehouse', 0, 'Nordic_Warehouse', [9, 11, 6]), { requiresWaterAccess: true }),
  regionalAsset('wyrmreach', 'coastal-warning-lookout', 'defense', 'P0', bldg('tower', 0, 'Nordic_Guardhouse', [7, 7, 9])),
  regionalAsset('wyrmreach', 'mixed-community-market-shed', 'trade', 'P0', bldg('shop', 1, 'Nordic_Shop_Small', [8, 6, 5])),
  regionalAsset('wyrmreach', 'rock-windbreak-hut', 'residence', 'P0', bldg('house', 2, 'Nordic_House_Cottage', [8, 6, 4.2])),
  regionalAsset('wyrmreach', 'ancient-smooth-stair', 'ruin', 'P0', prop('quarryBlock', 0, 'shrine', [3.5, 4.5, 2.4]), { requiresRuinContext: true }),
  regionalAsset('wyrmreach', 'relic-survey-camp', 'prop', 'P1', prop('stall', 1, 'cargo', [3.2, 2.8, 2.2])),
  regionalAsset('wyrmreach', 'impossible-measuring-plinth', 'ruin', 'P1', prop('shrine', 1, 'shrine', [2, 2, 2.8]), { requiresRuinContext: true }),
  regionalAsset('wyrmreach', 'gray-crust-descent-cover', 'ruin', 'P1', prop('well', 0, 'well', [3.4, 3.4, 1.5]), { requiresRuinContext: true }),
  regionalAsset('wyrmreach', 'storm-shielded-water-cache', 'infrastructure', 'P1', prop('barrels', 0, 'barrels', [2.4, 2.4, 1.8])),
  regionalAsset('wyrmreach', 'old-rift-boundary-cairn', 'prop', 'P1', prop('boulder', 0, 'bollards', [1.8, 1.8, 2.2])),
  regionalAsset('wyrmreach', 'pre-kingdom-black-wall', 'ruin', 'P1', bldg('wall', 1, 'CityWall', [12, 2.2, 5.5]), { requiresRuinContext: true }),

  // --- ZURALDI (12: 6 P0, 6 P1) ---
  regionalAsset('zuraldi', 'six-offices-council-hall', 'civic', 'P0', bldg('hall', 0, 'Nordic_Guildhall', [14, 10, 6.5])),
  regionalAsset('zuraldi', 'ancestor-monolith', 'sacred', 'P0', prop('shrine', 1, 'shrine', [2.4, 2.4, 4.2])),
  regionalAsset('zuraldi', 'terraced-stone-farmstead', 'residence', 'P0', bldg('farmhouse', 0, 'Nordic_Farmhouse', [13, 7, 4.5])),
  regionalAsset('zuraldi', 'ridge-watchhouse', 'defense', 'P0', bldg('tower', 0, 'Nordic_Guardhouse', [7, 7, 8.5])),
  regionalAsset('zuraldi', 'caravan-unloading-shelf', 'infrastructure', 'P0', bldg('warehouse', 0, 'Nordic_Warehouse', [9, 10, 6])),
  regionalAsset('zuraldi', 'switchback-bridge', 'infrastructure', 'P0', bldg('wall', 0, 'CityWall', [12, 3, 5]), { requiresSlope: true }),
  regionalAsset('zuraldi', 'cattle-yard', 'agriculture', 'P1', bldg('barn', 0, 'Nordic_Barn', [9, 11, 5])),
  regionalAsset('zuraldi', 'highland-cheese-smokehouse', 'industry', 'P1', bldg('bakery', 0, 'Nordic_Bakery', [7, 6, 4])),
  regionalAsset('zuraldi', 'druid-grove-altar', 'sacred', 'P1', prop('shrine', 0, 'shrine', [2.6, 2.6, 2.4])),
  regionalAsset('zuraldi', 'matriarch-table', 'prop', 'P1', prop('bench', 0, 'bench', [2.6, 1.4, 1.2])),
  regionalAsset('zuraldi', 'stone-pass-cairn', 'prop', 'P1', prop('signpost', 0, 'signpost', [1.8, 1.8, 2.5])),
  regionalAsset('zuraldi', 'mountain-pony-pack-cart', 'prop', 'P1', prop('cart', 0, 'cart', [2.2, 3.8, 2])),

  // --- SHARED ENVIRONMENTAL OVERLAYS (30: 6 overlays × 5 P1) ---
  overlayAsset('coast-harbor', 'pile-jetty', prop('fence', 0, 'bollards', [4.5, 2.2, 1.5]), { requiresWaterAccess: true }),
  overlayAsset('coast-harbor', 'fish-smoking-shed', bldg('bakery', 0, 'Nordic_Bakery', [7, 5.5, 4]), { requiresWaterAccess: true }),
  overlayAsset('coast-harbor', 'tide-stair-quay', prop('bollards', 0, 'bollards', [4.5, 2, 1.5]), { requiresWaterAccess: true }),
  overlayAsset('coast-harbor', 'net-mending-bench', prop('bench', 0, 'drying_rack', [2.6, 1.4, 1.8]), { requiresWaterAccess: true }),
  overlayAsset('coast-harbor', 'cargo-capstan', prop('barrels', 1, 'cargo', [2.2, 2.2, 1.8]), { requiresWaterAccess: true }),

  overlayAsset('forest-canopy', 'root-step-path', prop('fence', 0, 'fence', [4, 1.5, 0.8]), { requiresForest: true }),
  overlayAsset('forest-canopy', 'canopy-support-joint', prop('shrine', 0, 'swamp_tree', [3, 3, 4]), { requiresForest: true }),
  overlayAsset('forest-canopy', 'forest-herb-garden', prop('planter', 0, 'planter', [2.8, 1.6, 1.2]), { requiresForest: true }),
  overlayAsset('forest-canopy', 'elevated-ranger-platform', bldg('tower', 0, 'Med_Guardhouse', [6, 6, 8]), { requiresForest: true }),
  overlayAsset('forest-canopy', 'living-arch-gateway', bldg('gatehouse', 0, 'Gatehouse', [8, 4, 5]), { requiresForest: true }),

  overlayAsset('mountain-pass', 'pass-retaining-wall', prop('quarryBlock', 0, 'bollards', [4, 1.2, 2]), { requiresSlope: true }),
  overlayAsset('mountain-pass', 'switchback-parapet', prop('bollards', 0, 'bollards', [4.5, 1, 1.2]), { requiresSlope: true }),
  overlayAsset('mountain-pass', 'upland-drainage-culvert', prop('well', 0, 'trough', [2.8, 2, 1.4]), { requiresSlope: true }),
  overlayAsset('mountain-pass', 'caravan-pack-rack', prop('cart', 0, 'cargo', [2.6, 2, 1.8]), { requiresSlope: true }),
  overlayAsset('mountain-pass', 'avalanche-refuge', bldg('house', 2, 'Nordic_House_Cottage', [7, 5.5, 4]), { requiresSlope: true }),

  overlayAsset('ruins-rift', 'buried-threshold', prop('quarryBlock', 0, 'shrine', [3, 3, 1.5]), { requiresRuinContext: true }),
  overlayAsset('ruins-rift', 'broken-arch-section', prop('boulder', 0, 'bollards', [3.5, 1.8, 3.2]), { requiresRuinContext: true }),
  overlayAsset('ruins-rift', 'sealed-ward-plaque', prop('shrine', 1, 'notice_board', [1.8, 1, 2.2]), { requiresRuinContext: true }),
  overlayAsset('ruins-rift', 'archaeologist-tool-roll', prop('barrels', 1, 'cargo', [1.8, 1.8, 1.2]), { requiresRuinContext: true }),
  overlayAsset('ruins-rift', 'anomaly-scar-stone', prop('boulder', 0, 'totem', [2, 2, 2.4]), { requiresRuinContext: true }),

  overlayAsset('swamp-bog', 'raised-boardwalk', prop('fence', 0, 'fence', [4, 1.8, 1]), { requiresWetland: true }),
  overlayAsset('swamp-bog', 'reed-cutting-shed', bldg('barn', 0, 'Goblin_House_Small', [7, 6, 4.5]), { requiresWetland: true }),
  overlayAsset('swamp-bog', 'flatwater-skiff', prop('cart', 0, 'skiff', [3.2, 1.6, 1]), { requiresWetland: true }),
  overlayAsset('swamp-bog', 'bog-pole-marker', prop('signpost', 0, 'torch_pole', [1.2, 1.2, 3]), { requiresWetland: true }),
  overlayAsset('swamp-bog', 'mud-island-causeway', prop('fence', 0, 'fence', [4, 2.2, 0.6]), { requiresWetland: true }),

  overlayAsset('underground-cavern', 'deep-walkway-arch', bldg('wall', 0, 'CityWall', [10, 2.5, 5]), { requiresUnderground: true, forbidsSky: true }),
  overlayAsset('underground-cavern', 'cavern-drain-channel', prop('bollards', 0, 'trough', [3.5, 1.4, 1]), { requiresUnderground: true, forbidsSky: true }),
  overlayAsset('underground-cavern', 'shaft-air-damper', prop('well', 0, 'brazier', [2.4, 2.4, 2.6]), { requiresUnderground: true, forbidsSky: true }),
  overlayAsset('underground-cavern', 'cavern-lift-platform', bldg('warehouse', 0, 'Nordic_Warehouse', [8, 8, 7]), { requiresUnderground: true, forbidsSky: true }),
  overlayAsset('underground-cavern', 'dim-wayfinding-crystal', prop('lantern', 1, 'brazier', [1.4, 1.4, 2]), { requiresUnderground: true, forbidsSky: true }),
]);
